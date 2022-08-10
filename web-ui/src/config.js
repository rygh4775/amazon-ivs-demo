// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: MIT-0

/* eslint-disable */

// Amazon IVS Playback URL
// Replace this with your own Amazon IVS Playback URL
export const PLAYBACK_URL = "https://760b256a3da8.us-east-1.playback.live-video.net/api/video/v1/us-east-1.049054135175.channel.6tM2Z9kY16nH.m3u8";
// export const PLAYBACK_URL = "https://fcc3ddae59ed.us-west-2.playback.live-video.net/api/video/v1/us-west-2.893648527354.channel.xhP3ExfcX8ON.m3u8";
// export const PLAYBACK_URL = "https://47c80cd71721.us-west-2.playback.live-video.net/api/video/v1/us-west-2.713656305424.channel.hveGSGccAQA3.m3u8";

// Chat websocket address
// The websocket endpoint for the chat room: wss://edge.ivschat.<AWS_REGION>.amazonaws.com
export const CHAT_WEBSOCKET = "wss://edge.ivschat.us-west-2.amazonaws.com";

// Chat API URL
// The Amazon IVS Chat backend endpoint. You must deploy the serverless backend to get this value.
export const API_URL = "https://jsdxdqa5s6.execute-api.us-west-2.amazonaws.com/Prod";

export const QOS_API_URL = "https://d3vvwyf8zf9ak3.cloudfront.net/prod";

// Chat room id (ARN)
export const CHAT_ROOM_ID = "arn:aws:ivschat:us-west-2:713656305424:room/Mr0yJSdTis5P";

// Token duration in minutes
// Values between 1 and 180 are supported.
export const TOKEN_EXPIRATION_IN_MINUTES = 55;

// Token refresh delay
// This client app will attempt to obtain a new token for the user 0.5 minutes
// before it expires.
export const TOKEN_REFRESH_IN_MINUTES = TOKEN_EXPIRATION_IN_MINUTES - 0.5;

export const CLIENT_PLATFORM = "web";
