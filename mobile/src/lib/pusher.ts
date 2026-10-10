import Pusher from "pusher-js/react-native";
import { authHeader } from "./api";
import { API_URL, PUSHER_CLUSTER, PUSHER_KEY } from "./config";

let client: Pusher | null = null;

/** Pusher client for live PvP. Presence-channel auth goes to the website with the app's Bearer token. */
export function getPusher(): Pusher {
  if (!client) {
    client = new Pusher(PUSHER_KEY, {
      cluster: PUSHER_CLUSTER,
      channelAuthorization: {
        endpoint: `${API_URL}/api/pusher/auth`,
        transport: "ajax",
        headersProvider: () => authHeader(),
      },
    });
  }
  return client;
}
