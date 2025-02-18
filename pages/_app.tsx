import '../styles/globals.css';
import { useState } from 'react';
import { useRouter } from 'next/router';
import { AppProps } from 'next/app';

function MyApp({ Component, pageProps }: AppProps) {
  const [userName, setUserName] = useState('');
  const [roomName, setRoomName] = useState('');
  const router = useRouter();

  const handleLogin = (event: Event) => {
    event.preventDefault();
    router.push(`/room/${roomName}`);
  };

  return (
    <Component
      handleCredChange={(userName: string, roomName: string) => {
        setUserName(userName);
        setRoomName(roomName);
      }}
      userName={userName}
      roomName={roomName}
      handleLogin={handleLogin}
      {...pageProps}
    />
  );
}

export default MyApp;
