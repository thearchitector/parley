# Parley 🏴‍☠️

No-frills peer-to-peer web conferencing.

## Features

- Create a new discussion room.
- Join an existing room.
- See and hear others.
- See yourself.
- Mute your mic and camera.
  - Audio mute indicators on yourself and participants.

## Anti-features

- Breakout rooms.
- Session recording.

## To Do

1. Screen name.
2. Chat.
3. Connect via URL.

   - If you go to a URL with a peer id that already exists, you connect to their session.
   - If you go to a URL with a peer id that doesn't exist, you become the host (with that peer id) and start a session.

4. Legitimate error handling.

   - Kick everyone out if the host is destroyed / closes.
     - or ... transfer host? i think this word be pretty trivial - just pick a client, send a packet saying "set `isHost` and the list of original host's `connectedParticipants`" -- they may already have the latter information via either of the cached mappings.
   - What to do if temporary disconnect?
     - Figure out a way to `.reconnect()`?
     - Destroy the peer and revisit main page (kick them out)?

5. Mobile site (no video, audio + chat only).
6. Performance

   - Restrict local video to 640p using [sdp transform or media constraints](https://stackoverflow.com/questions/71838689/how-to-use-sdptransform-in-peerjs-for-high-quality-audio-bitrate)
   - Restrict outgoing video to 144p.
   - Frame rate?
   - Spoke-style communication? (instead of each connecting to every other, they all connect to the host which sends AV/data to every other)
     - Not immediately obvious if this is a better design -- it reduces the total number of conns, but at least doubles latency for each one

## License

TBD.
