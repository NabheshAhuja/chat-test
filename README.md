# Peer-to-Peer Video Call with Next.js, Socket.io, and WebRTC

This project is a simple video chat application built using Next.js, Socket.io, and the native WebRTC APIs. It allows users to join a room and communicate via video and audio in real-time.

## Features

- Peer-to-peer video calling
- Room management for up to two participants
- Signaling server using Socket.io
- User media access for camera and microphone

## Getting Started

### Prerequisites

- Node.js (version 12 or higher)
- Yarn (optional, but recommended)

### Installation

1. Clone the repository:

   ```
   git clone https://github.com/yourusername/next-webrtc-socket-io.git
   ```

2. Navigate to the project directory:

   ```
   cd next-webrtc-socket-io
   ```

3. Install the dependencies:

   ```
   yarn install
   ```

   or

   ```
   npm install
   ```

### Running the Application

To start the development server, run:

```
yarn run dev
```

or

```
npm run dev
```

The application will be available at `http://localhost:3000`.

### Usage

1. Open your browser and navigate to `http://localhost:3000`.
2. Enter a room name and click "Join Room".
3. If another user joins the same room, a video call will be initiated.

### Notes

- This application cannot be deployed on Vercel due to the lack of support for WebSocket connections in serverless functions. It is recommended to deploy it on a traditional server setup.
- For a similar implementation that can be deployed on Vercel, consider using Pusher for signaling.

## License

This project is licensed under the MIT License. See the LICENSE file for details.