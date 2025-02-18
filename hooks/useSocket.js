import { useEffect } from 'react';
import Pusher from 'pusher-js';

const useSocket = () => {
  useEffect(() => {
    Pusher.logToConsole = true;

    const pusher = new Pusher(process.env.NEXT_PUBLIC_PUSHER_KEY, {
      cluster: process.env.NEXT_PUBLIC_PUSHER_CLUSTER,
      encrypted: true,
    });

    return () => {
      pusher.disconnect();
    };
  }, []);
};

export default useSocket;