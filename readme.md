# Redis pubsub

## Ref
- https://socket.io/docs/v4/tutorial/step-9

## Message stream vs realtime pubsub
| - | Message stream | Realtime pubsub |
| --- | --- | --- |
| Message delivery | Consumers Pull | Broker Push (low latency) |
| Buffer msg | YES | NO (can't see past messages when join/rejoin) |
