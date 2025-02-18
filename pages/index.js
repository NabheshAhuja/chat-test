import Head from 'next/head'
import { useRouter } from 'next/router'
import { useState } from 'react'
import styles from '../styles/Home.module.css'
import Pusher from 'pusher-js';

export default function Home() {
  const router = useRouter()
  const [roomName, setRoomName] = useState('')

  const joinRoom = () => {
    const room = roomName || Math.random().toString(36).slice(2);
    const pusher = new Pusher(process.env.NEXT_PUBLIC_PUSHER_KEY, {
      cluster: process.env.NEXT_PUBLIC_PUSHER_CLUSTER,
      authEndpoint: '/api/pusher/auth',
    });

    const channel = pusher.subscribe(`presence-${room}`);
    channel.bind('pusher:subscription_succeeded', () => {
      router.push(`/room/${room}`);
    });
  }

  return (
    <div className={styles.container}>
      <Head>
        <title>Native WebRTC API with NextJS</title>
        <meta name="description" content="Use Native WebRTC API for video conferencing" />
        <link rel="icon" href="/favicon.ico" />
      </Head>

      <main className={styles.main}>
       <h1>Lets join a room!</h1>
       <input onChange={(e) => setRoomName(e.target.value)} value={roomName} className={styles['room-name']} />
       <button onClick={joinRoom} type="button" className={styles['join-room']}>Join Room</button>
      </main>
    </div>
  )
}