# Redis pubsub

## Ref
- https://socket.io/docs/v4/tutorial/step-9
- https://github.com/socketio/socket.io-redis-adapter

## Message stream vs realtime pubsub
| - | Message stream | Realtime pubsub |
| --- | --- | --- |
| Message delivery | Consumers Pull | Broker Push (low latency) |
| Buffer msg | YES | NO (can't see past messages when join/rejoin) |

## TODOs
- Impl using Nodejs
  - https://github.com/socketio/socket.io-redis-adapter
- Forward requests to servers
  - Integrate with Reverse proxy
    - What's load balancing strategy? sticky session?
  - DNS?
- Implement Chatroom feature
  - w/out Redis pubsub
- Test limit of websocket connections per 1 server