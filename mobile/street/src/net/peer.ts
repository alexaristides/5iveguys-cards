/**
 * A direct (peer-to-peer) WebRTC data channel between the two phones in a room,
 * for the match itself: much quicker than going through the website. Set up
 * with one offer and one answer passed through the room (ICE candidates are
 * gathered first and sent inside them). If the networks won't connect directly
 * (some mobile carriers), the room carries on through the relay instead.
 */

const ICE: RTCIceServer[] = [
  { urls: ["stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302"] },
  { urls: "stun:stun.cloudflare.com:3478" },
];
/** Longest to wait for ICE candidates before sending what we have. */
const GATHER_MS = 2500;
/** Give up on a direct connection after this long. */
const CONNECT_MS = 9000;

export type PeerSignal = { kind: "offer" | "answer"; sdp: string };

export class Peer {
  private pc: RTCPeerConnection;
  private dc: RTCDataChannel | null = null;
  private timer: ReturnType<typeof setTimeout>;
  private closed = false;

  constructor(
    private signal: (s: PeerSignal) => void,
    private onMessage: (data: string) => void,
    /** Open (true) or failed / closed (false). */
    private onState: (open: boolean) => void,
  ) {
    this.pc = new RTCPeerConnection({ iceServers: ICE });
    this.pc.addEventListener("datachannel", (e) => this.attach(e.channel));
    this.pc.addEventListener("connectionstatechange", () => {
      if (this.pc.connectionState === "failed" || this.pc.connectionState === "closed") this.close();
    });
    this.timer = setTimeout(() => { if (!this.open) this.close(); }, CONNECT_MS);
  }

  static get supported() {
    return typeof RTCPeerConnection !== "undefined";
  }

  get open() { return this.dc?.readyState === "open"; }

  /** The side that creates the room starts. */
  async offer() {
    // Unordered and never resent: a late snapshot is worthless (the next one is coming).
    this.attach(this.pc.createDataChannel("game", { ordered: false, maxRetransmits: 0 }));
    await this.pc.setLocalDescription(await this.pc.createOffer());
    this.signal({ kind: "offer", sdp: await this.gathered() });
  }

  async handle(s: PeerSignal) {
    if (this.closed) return;
    try {
      await this.pc.setRemoteDescription({ type: s.kind, sdp: s.sdp });
      if (s.kind === "offer") {
        await this.pc.setLocalDescription(await this.pc.createAnswer());
        this.signal({ kind: "answer", sdp: await this.gathered() });
      }
    } catch {
      this.close();
    }
  }

  send(data: string) {
    if (!this.open) return false;
    try {
      this.dc!.send(data);
      return true;
    } catch {
      return false;
    }
  }

  close() {
    if (this.closed) return;
    this.closed = true;
    clearTimeout(this.timer);
    try { this.dc?.close(); } catch { /* already closed */ }
    try { this.pc.close(); } catch { /* already closed */ }
    this.onState(false);
  }

  private attach(dc: RTCDataChannel) {
    this.dc = dc;
    dc.addEventListener("open", () => { clearTimeout(this.timer); this.onState(true); });
    dc.addEventListener("close", () => this.close());
    dc.addEventListener("message", (e) => { if (typeof e.data === "string") this.onMessage(e.data); });
  }

  /** The local description once ICE gathering is done (or has had long enough). */
  private gathered(): Promise<string> {
    const pc = this.pc;
    return new Promise((resolve) => {
      const done = () => {
        pc.removeEventListener("icegatheringstatechange", check);
        clearTimeout(t);
        resolve(pc.localDescription?.sdp ?? "");
      };
      const check = () => { if (pc.iceGatheringState === "complete") done(); };
      const t = setTimeout(done, GATHER_MS);
      pc.addEventListener("icegatheringstatechange", check);
      check();
    });
  }
}
