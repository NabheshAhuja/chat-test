import { useRouter } from 'next/router';
import { useEffect, useRef, useState } from 'react';
import Pusher, { PresenceChannel, Members } from 'pusher-js';
import styles from '../../styles/Room.module.css';

interface Props {
  userName: string;
  roomName: string;
}

const ICE_SERVERS = {
  iceServers: [
    { urls: 'stun:openrelay.metered.ca:80' },
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
  ],
};

export default function Room({ userName, roomName }: Props) {
  const router = useRouter();
  const [isTeacher, setIsTeacher] = useState(false);
  const [hostStream, setHostStream] = useState<MediaStream | null>(null);
  const [partnerVideos, setPartnerVideos] = useState<{ [key: string]: MediaStream }>({});

  const pusherRef = useRef<Pusher | null>(null);
  const channelRef = useRef<PresenceChannel | null>(null);
  const peerConnections = useRef<{ [key: string]: RTCPeerConnection }>({});
  const localVideoRef = useRef<HTMLVideoElement>(null);

  // Student triggers this event so teacher can send offer.
  const triggerClientJoin = (myId: string) => {
    channelRef.current?.trigger('client-join', { from: myId });
  };

  useEffect(() => {
    // Initialize Pusher presence channel.
    pusherRef.current = new Pusher(process.env.NEXT_PUBLIC_PUSHER_KEY!, {
      authEndpoint: '/api/pusher/auth',
      auth: { params: { username: userName } },
      cluster: process.env.NEXT_PUBLIC_PUSHER_CLUSTER,
    });
    channelRef.current = pusherRef.current.subscribe(`presence-${roomName}`) as PresenceChannel;

    channelRef.current.bind('pusher:subscription_succeeded', (members: Members) => {
      // First member becomes teacher.
      if (members.count === 1) {
        setIsTeacher(true);
      }
      joinRoom();
    });

    // Teacher: when a student joins, create and send an offer.
    channelRef.current.bind('client-join', (data: { from: string }) => {
      if (isTeacher && hostStream) {
        createAndSendOffer(data.from);
      }
    });

    // Student: handle teacher's offer.
    channelRef.current.bind('server-offer', (data: { sdp: RTCSessionDescriptionInit; from: string; to: string }) => {
      const myId = channelRef.current?.members.me.id;
      if (myId && data.to === myId) {
        handleServerOffer(data.sdp, data.from);
      }
    });

    // Teacher: handle student’s answer.
    channelRef.current.bind('client-answer', (data: { sdp: RTCSessionDescriptionInit; from: string; to: string }) => {
      const myId = channelRef.current?.members.me.id;
      if (myId && data.to === myId) {
        const pc = peerConnections.current[data.from];
        if (pc) {
          pc.setRemoteDescription(data.sdp).catch(console.error);
        }
      }
    });

    // Both sides: handle ICE candidate messages.
    channelRef.current.bind('client-candidate', (data: { candidate: RTCIceCandidate; from: string; to: string }) => {
      const myId = channelRef.current?.members.me.id;
      if (myId && data.to === myId) {
        const pc = peerConnections.current[data.from];
        if (pc) {
          pc.addIceCandidate(new RTCIceCandidate(data.candidate)).catch(console.error);
        }
      }
    });

    // Clean up on unmount.
    channelRef.current.bind('pusher:member_removed', (member) => {
      handlePeerLeaving(member.id);
    });
    return () => {
      pusherRef.current?.unsubscribe(`presence-${roomName}`);
    };
  }, [userName, roomName, isTeacher, hostStream]);

  const joinRoom = () => {
    navigator.mediaDevices.getUserMedia({ audio: true, video: { width: 1280, height: 720 } })
      .then((stream) => {
        if (localVideoRef.current) {
          localVideoRef.current.srcObject = stream;
          localVideoRef.current.onloadedmetadata = () => localVideoRef.current?.play();
        }
        if (isTeacher) {
          setHostStream(stream);
        } else {
          // Student triggers join event so teacher sends offer.
          const myId = channelRef.current?.members.me.id;
          if (myId) {
            triggerClientJoin(myId);
          }
        }
      })
      .catch(console.error);
  };

  // Teacher creates a peer connection to send their stream.
  const createAndSendOffer = (peerId: string) => {
    const pc = new RTCPeerConnection(ICE_SERVERS);
    peerConnections.current[peerId] = pc;
    hostStream?.getTracks().forEach(track => pc.addTrack(track, hostStream!));

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        const myId = channelRef.current?.members.me.id;
        channelRef.current?.trigger('client-candidate', { candidate: event.candidate, from: myId, to: peerId });
      }
    };

    pc.createOffer()
      .then((offer) => pc.setLocalDescription(offer).then(() => offer))
      .then((offer) => {
        const myId = channelRef.current?.members.me.id;
        // Send teacher’s offer to the student.
        channelRef.current?.trigger('server-offer', { sdp: offer, from: myId, to: peerId });
      })
      .catch(console.error);
  };

  // Student handles the teacher's offer.
  const handleServerOffer = (sdp: RTCSessionDescriptionInit, fromPeer: string) => {
    const pc = new RTCPeerConnection(ICE_SERVERS);
    peerConnections.current[fromPeer] = pc;

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        const myId = channelRef.current?.members.me.id;
        channelRef.current?.trigger('client-candidate', { candidate: event.candidate, from: myId, to: fromPeer });
      }
    };

    pc.ontrack = (event) => {
      setPartnerVideos(prev => ({ ...prev, [fromPeer]: event.streams[0] }));
    };

    pc.setRemoteDescription(sdp)
      .then(() => pc.createAnswer())
      .then(answer => pc.setLocalDescription(answer).then(() => answer))
      .then((answer) => {
        const myId = channelRef.current?.members.me.id;
        channelRef.current?.trigger('client-answer', { sdp: answer, from: myId, to: fromPeer });
      })
      .catch(console.error);
  };

  const handlePeerLeaving = (peerId: string) => {
    if (peerConnections.current[peerId]) {
      peerConnections.current[peerId].close();
      delete peerConnections.current[peerId];
    }
    setPartnerVideos(prev => {
      const updated = { ...prev };
      delete updated[peerId];
      return updated;
    });
  };

  const leaveRoom = () => {
    if (localVideoRef.current?.srcObject) {
      (localVideoRef.current.srcObject as MediaStream).getTracks().forEach(track => track.stop());
    }
    Object.keys(peerConnections.current).forEach(peerId => {
      handlePeerLeaving(peerId);
    });
    router.push('/');
  };

  const toggleMediaStream = (type: 'video' | 'audio', state: boolean) => {
    const stream = isTeacher ? hostStream : (localVideoRef.current?.srcObject as MediaStream);
    if (stream) {
      stream.getTracks().forEach(track => {
        if (track.kind === type) {
          track.enabled = !state;
        }
      });
    }
  };

  const toggleMic = () => {
    toggleMediaStream('audio', false);
  };

  const toggleCamera = () => {
    toggleMediaStream('video', false);
  };

  return (
    <div className={styles['videos-container']}>
      <div className={styles['video-container']}>
        <video autoPlay ref={localVideoRef} muted />
        <div className={styles.controls}>
          <button onClick={toggleMic} type="button">Toggle Mic</button>
          <button onClick={leaveRoom} type="button">Leave</button>
          <button onClick={toggleCamera} type="button">Toggle Camera</button>
        </div>
      </div>
      {Object.entries(partnerVideos).map(([peerId, stream]) => (
        <div key={peerId} className={styles['video-container']}>
          <video autoPlay ref={(video) => { if (video) video.srcObject = stream; }} />
        </div>
      ))}
    </div>
  );
}
