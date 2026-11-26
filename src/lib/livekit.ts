import { AccessToken } from "livekit-server-sdk";

export interface LiveKitConfig {
  apiKey: string;
  apiSecret: string;
  serverUrl: string;
}

export function getLiveKitConfig(): LiveKitConfig | null {
  const apiKey = process.env.LIVEKIT_API_KEY?.trim() ?? "";
  const apiSecret = process.env.LIVEKIT_API_SECRET?.trim() ?? "";
  const serverUrl = process.env.NEXT_PUBLIC_LIVEKIT_URL?.trim() ?? "";

  if (!apiKey || !apiSecret || !serverUrl) {
    return null;
  }

  return { apiKey, apiSecret, serverUrl };
}

export function buildLiveKitRoomName(roomSlug: string, tableId: string): string {
  return `${roomSlug}:${tableId}`;
}

export async function mintLiveKitTableToken(input: {
  config: LiveKitConfig;
  roomSlug: string;
  tableId: string;
  participantIdentity: string;
  participantName: string;
}): Promise<{
  token: string;
  serverUrl: string;
  roomName: string;
  participantIdentity: string;
}> {
  const roomName = buildLiveKitRoomName(input.roomSlug, input.tableId);
  const token = new AccessToken(input.config.apiKey, input.config.apiSecret, {
    identity: input.participantIdentity,
    name: input.participantName,
    ttl: "2h",
  });

  token.addGrant({
    roomJoin: true,
    room: roomName,
    canPublish: true,
    canSubscribe: true,
    canPublishData: true,
  });

  const jwt = await token.toJwt();

  return {
    token: jwt,
    serverUrl: input.config.serverUrl,
    roomName,
    participantIdentity: input.participantIdentity,
  };
}
