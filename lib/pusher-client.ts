import PusherJS from "pusher-js";

let client: PusherJS | null = null;

export function getPusherClient(): PusherJS {
  if (!client) {
    client = new PusherJS(process.env.NEXT_PUBLIC_PUSHER_KEY!, {
      cluster: process.env.NEXT_PUBLIC_PUSHER_CLUSTER!,
      // Auth endpoint for presence channels (used by useLobby for forfeit detection)
      authEndpoint: "/api/pusher/auth",
    });
  }
  return client;
}
