import { useRouter } from 'next/router';
import Pusher, { Members, PresenceChannel } from 'pusher-js';
import { useEffect, useRef, useState } from 'react';
import styles from '../../styles/Room.module.css';

interface Props {
  userName: string;
  roomName: string;
}

const ICE_SERVERS = {
  iceServers: [
    {
      urls: 'stun:openrelay.metered.ca:80'
    },
    {
      urls: 'stun:stun.l.google.com:19302',
    },
    {
      urls: 'stun:stun2.l.google.com:19302',
    },
  ],
};

export default function Room({ userName, roomName }: Props) {
  const [micActive, setMicActive] = useState(true);
  const [cameraActive, setCameraActive] = useState(true);
  const router = useRouter();

  const host = useRef(false);
  const pusherRef = useRef<Pusher | null>(null);
  const channelRef = useRef<PresenceChannel | null>(null);

  const rtcConnections = useRef<{ [key: string]: RTCPeerConnection }>({});
  const userStream = useRef<MediaStream | null>(null);

  const userVideo = useRef<HTMLVideoElement>(null);
  const [partnerVideos, setPartnerVideos] = useState<{ [key: string]: HTMLVideoElement }>({});

  useEffect(() => {
    pusherRef.current = new Pusher(process.env.NEXT_PUBLIC_PUSHER_KEY!, {
      authEndpoint: '/api/pusher/auth',
      auth: {
        params: { username: userName },
      },
      cluster: process.env.NEXT_PUBLIC_PUSHER_CLUSTER,
    });
    channelRef.current = pusherRef.current.subscribe(
      `presence-${roomName}`
    ) as PresenceChannel;

    channelRef.current.bind('pusher:subscription_succeeded', (members: Members) => {
      if (members.count === 1) {
        host.current = true;
      }
      handleRoomJoined();
    });

    channelRef.current.bind('pusher:member_removed', handlePeerLeaving);
    channelRef.current.bind('client-offer', (offer: { sdp: RTCSessionDescriptionInit, from: string }) => {
      if (!host.current) {
        handleReceivedOffer(offer.sdp, offer.from);
      }
    });
    channelRef.current.bind('client-ready', (data: { from: string }) => {
      if (host.current) {
        initiateCall(data.from);
      }
    });
    channelRef.current.bind('client-answer', (answer: { sdp: RTCSessionDescriptionInit, from: string }) => {
      if (host.current) {
        handleAnswerReceived(answer.sdp, answer.from);
      }
    });
    channelRef.current.bind('client-ice-candidate', (candidate: { candidate: RTCIceCandidate, from: string }) => {
      handleNewIceCandidateMsg(candidate.candidate, candidate.from);
    });

    return () => {
      if (pusherRef.current) pusherRef.current.unsubscribe(`presence-${roomName}`);
    };
  }, [userName, roomName]);

  const handleRoomJoined = () => {
    navigator.mediaDevices
      .getUserMedia({
        audio: true,
        video: { width: 1280, height: 720 },
      })
      .then((stream) => {
        userStream.current = stream;
        userVideo.current!.srcObject = stream;
        userVideo.current!.onloadedmetadata = () => {
          userVideo.current!.play();
        };
        if (!host.current) {
          channelRef.current!.trigger('client-ready', { from: userName });
        }
      })
      .catch((err) => {
        console.log(err);
      });
  };

  const createPeerConnection = (memberId: string) => {
    const connection = new RTCPeerConnection(ICE_SERVERS);
    connection.onicecandidate = (event) => handleICECandidateEvent(event, memberId);
    connection.ontrack = (event) => handleTrackEvent(event, memberId);
    connection.onicecandidateerror = (e) => console.log(e);
    rtcConnections.current[memberId] = connection;
    return connection;
  };

  const initiateCall = (memberId: string) => {
    const connection = createPeerConnection(memberId);
    userStream.current?.getTracks().forEach((track) => {
      connection.addTrack(track, userStream.current!);
    });
    connection.createOffer()
      .then((offer) => {
        connection.setLocalDescription(offer);
        channelRef.current?.trigger('client-offer', { sdp: offer, from: userName, to: memberId });
      })
      .catch((error) => {
        console.log(error);
      });
  };

  const handleReceivedOffer = (offer: RTCSessionDescriptionInit, memberId: string) => {
    const connection = createPeerConnection(memberId);
    userStream.current?.getTracks().forEach((track) => {
      connection.addTrack(track, userStream.current!);
    });
    connection.setRemoteDescription(offer);
    connection.createAnswer()
      .then((answer) => {
        connection.setLocalDescription(answer);
        channelRef.current?.trigger('client-answer', { sdp: answer, from: userName, to: memberId });
      })
      .catch((error) => {
        console.log(error);
      });
  };

  const handleAnswerReceived = (answer: RTCSessionDescriptionInit, memberId: string) => {
    const connection = rtcConnections.current[memberId];
    connection.setRemoteDescription(answer)
      .catch((error) => console.log(error));
  };

  const handleICECandidateEvent = (event: RTCPeerConnectionIceEvent, memberId: string) => {
    if (event.candidate) {
      channelRef.current?.trigger('client-ice-candidate', { candidate: event.candidate, from: userName, to: memberId });
    }
  };

  const handleNewIceCandidateMsg = (incoming: RTCIceCandidate, memberId: string) => {
    const candidate = new RTCIceCandidate(incoming);
    const connection = rtcConnections.current[memberId];
    connection.addIceCandidate(candidate)
      .catch((error) => console.log(error));
  };

  const handleTrackEvent = (event: RTCTrackEvent, memberId: string) => {
    const videoElement = document.createElement('video');
    videoElement.srcObject = event.streams[0];
    videoElement.autoplay = true;
    videoElement.className = styles['video-element'];
    setPartnerVideos((prev) => ({ ...prev, [memberId]: videoElement }));
  };

  const toggleMediaStream = (type: 'video' | 'audio', state: boolean) => {
    userStream.current!.getTracks().forEach((track) => {
      if (track.kind === type) {
        track.enabled = !state;
      }
    });
  };

  const handlePeerLeaving = (memberId: string) => {
    if (partnerVideos[memberId]?.srcObject) {
      (partnerVideos[memberId].srcObject as MediaStream)
        .getTracks()
        .forEach((track) => track.stop());
    }
    if (rtcConnections.current[memberId]) {
      rtcConnections.current[memberId].ontrack = null;
      rtcConnections.current[memberId].onicecandidate = null;
      rtcConnections.current[memberId].close();
      delete rtcConnections.current[memberId];
    }
    setPartnerVideos((prev) => {
      const newVideos = { ...prev };
      delete newVideos[memberId];
      return newVideos;
    });
  };

  const leaveRoom = () => {
    if (userVideo.current!.srcObject) {
      (userVideo.current!.srcObject as MediaStream)
        .getTracks()
        .forEach((track) => track.stop());
    }
    Object.keys(partnerVideos).forEach((memberId) => {
      handlePeerLeaving(memberId);
    });
    router.push('/');
  };

  const toggleMic = () => {
    toggleMediaStream('audio', micActive);
    setMicActive((prev) => !prev);
  };

  const toggleCamera = () => {
    toggleMediaStream('video', cameraActive);
    setCameraActive((prev) => !prev);
  };

  return (
    <div className={styles['videos-container']}>
      <div className={styles['video-container']}>
        <video autoPlay ref={userVideo} muted />
        <div className={styles.controls}>
          <button onClick={toggleMic} type="button">
            {micActive ? 'Mute Mic' : 'UnMute Mic'}
          </button>
          <button onClick={leaveRoom} type="button">
            Leave
          </button>
          <button onClick={toggleCamera} type="button">
            {cameraActive ? 'Stop Camera' : 'Start Camera'}
          </button>
        </div>
      </div>
      {Object.values(partnerVideos).map((videoElement: any, index) => (
        <div key={index} className={styles['video-container']}>
          {videoElement}
        </div>
      ))}
    </div>
  );
}
