// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: MIT-0

import React, {useEffect} from "react";
import axios from "axios";

import * as config from "../../config";

// Styles
import "./VideoPlayer.css";
import "./Quiz.css";

const VideoPlayer = ({playbackUrl}) => {
    useEffect(() => {

        const sendQoSEventUrl = `${config.QOS_API_URL}/streams`;
        const sendQuizAnswerUrl = `${config.QOS_API_URL}/streams`;
        const MediaPlayerPackage = window.IVSPlayer;
        const quizEl = document.getElementById("quiz");
        const waitMessage = document.getElementById("waiting");
        const questionEl = document.getElementById("question");
        const answersEl = document.getElementById("answers");
        const cardInnerEl = document.getElementById("card-inner");

        // First, check if the browser supports the Amazon IVS player.
        if (!MediaPlayerPackage.isPlayerSupported) {
            console.warn(
                "The current browser does not support the Amazon IVS player."
            );
            return;
        }

        const PlayerState = MediaPlayerPackage.PlayerState;
        const PlayerEventType = MediaPlayerPackage.PlayerEventType;

        // Initialize player
        const player = MediaPlayerPackage.create();
        player.attachHTMLVideoElement(document.getElementById("video-player"));

        // Attach event listeners
        player.addEventListener(PlayerState.READY, () => {
            console.info("Player State - READY");

            // === Send off playback end event and reset QoS event work variables ===
            // Before the player loads a new channel, send off the last QoS event of the previous
            //   channel played.
            // Note: This will never happens in this demo, because the demo doesn't offer an interface
            //   to load a new channel, but an IVS customer App should have this logic.
            // (Yueshi to do) We also need to call this function if an IVS cusomter App or webpage is closed,
            //   how to detect this situation and call this function?
            // if (hasBeenPlayingVideo) {
            //     sendOffLastPlaybackSummaryEventAndPlaybackEndEvent();
            // }

            hasBeenPlayingVideo = true;
            lastPlayerStateREADYTime = Date.now();
            setPlayerStateVariables("READY");

            setUserIDSessionID();
            startupLatencyMsOfThisSession = 0;
            playingTimeMsInLastMinute = 0;
            bufferingTimeMsInLastMinute = 0;
            bufferingCountInLastMinute = 0;
            errorCountInLastMinute = 0;
            lastQuality = undefined;
            // === Send off playback end event and reset QoS event work variables ===
        });
        player.addEventListener(PlayerState.BUFFERING, () => {
            console.log("Player State - BUFFERING");

            // === Update QoS event work variables ===
            if (lastPlayerState == "PLAYING") { // PLAYING -> BUFFERING (can only happen in the middle of a playback session)
                playingTimeMsInLastMinute += (Date.now() - lastPlayerStateUpdateOrPlaybackSummaryEventSentTime);
                bufferingCountInLastMinute += 1;
            }

            setPlayerStateVariables("BUFFERING");
            // === Update QoS event work variables ===
        });
        player.addEventListener(PlayerState.PLAYING, () => {
            console.info("Player State - PLAYING");

            // === Send off playback start event and update QoS event work variables ===
            if (startupLatencyMsOfThisSession == 0) { // the very beginning of a playback session
                lastPlaybackStartOrPlaybackSummaryEventSentTime = Date.now();
                startupLatencyMsOfThisSession = Date.now() - lastPlayerStateREADYTime;
                sendPlaybackStartEvent(sendQoSEventUrl);

                if (lastQuality === undefined) {
                    lastQuality = player.getQuality();
                }
            } else {
                if (lastPlayerState == "BUFFERING") { // BUFFERING -> PLAYING (in the middle of a playback session)
                    bufferingTimeMsInLastMinute += Date.now() - lastPlayerStateUpdateOrPlaybackSummaryEventSentTime;

                    // (Yueshi to do) to confirm with the player team: will QUALITY_CHANGE event be triggered when player rebuffers
                    //   and selects a different rendiion after the rebuffering
                    let newQuality = player.getQuality();
                    if (lastQuality.bitrate != newQuality.bitrate) {
                        console.log(`Quality changed from "${lastQuality.name}" to "${newQuality.name}".`);
                        sendQualityChangedEvent(sendQoSEventUrl, lastQuality, newQuality);
                        lastQuality = newQuality;
                    }
                }
            }
        });
        player.addEventListener(PlayerState.IDLE, () => {
            console.info("Player State - IDLE");

            // === Update QoS event work variables ===
            if (lastPlayerState == "PLAYING") { // PLAYING -> IDLE
                playingTimeMsInLastMinute += (Date.now() - lastPlayerStateUpdateOrPlaybackSummaryEventSentTime);
            } else if (lastPlayerState == "BUFFERING") { // BUFFERING -> IDLE
                bufferingTimeMsInLastMinute += (Date.now() - lastPlayerStateUpdateOrPlaybackSummaryEventSentTime);
            }

            setPlayerStateVariables("IDLE");
            // === Update QoS event work variables ===
        });
        player.addEventListener(PlayerState.ENDED, () => {
            console.info("Player State - ENDED");

            // === Update QoS event work variables ===
            if (lastPlayerState == "PLAYING") { // PLAYING -> ENDED
                playingTimeMsInLastMinute += (Date.now() - lastPlayerStateUpdateOrPlaybackSummaryEventSentTime);
            }

            setPlayerStateVariables("ENDED");
            // === Update QoS event work variables ===
        });
        player.addEventListener(PlayerEventType.ERROR, (err) => {
            console.warn("Player Event - ERROR:", err);

            // === Update QoS event work variables ===
            errorCountInLastMinute++;
            // === Update QoS event work variables ===
        });
        player.addEventListener(PlayerEventType.QUALITY_CHANGED, function () {
            console.log("PlayerEventType - QUALITY_CHANGED");

            // === Send off quality change event and update QoS event work variables ===
            let newQuality = player.getQuality();
            if (lastQuality === undefined) {
                lastQuality = newQuality;
                console.log(`Quality initialized to "${lastQuality.name}".`);
            } else if (lastQuality.bitrate != newQuality.bitrate) {
                console.log(`Quality changed from "${lastQuality.name}" to "${newQuality.name}".`);
                sendQualityChangedEvent(sendQoSEventUrl, lastQuality, newQuality);
                lastQuality = newQuality;
            }
            // === Send off quality change event and update QoS event work variables ===
        });
        player.addEventListener(PlayerEventType.TEXT_METADATA_CUE, function (cue) {
            const metadataText = cue.text;
            const position = player.getPosition().toFixed(2);
            console.log(
                `PlayerEventType - METADATA: "${metadataText}". Observed ${position}s after playback started.`
            );

            triggerQuiz(metadataText, userId, sessionId);
        });

        // Setup stream and play
        player.setAutoplay(true);
        player.load(playbackUrl);
        player.setVolume(0.5);

        setInterval(function () {
            console.debug("Live latency in seconds", player.getLiveLatency());
        }, 2000);

        // === Send off a QoS event every minute ===
        setInterval(function () {
            if ((lastPlaybackStartOrPlaybackSummaryEventSentTime != -1) && ((Date.now() - lastPlaybackStartOrPlaybackSummaryEventSentTime) > 60000)) {
                sendPlaybackSummaryEventIfNecessary(sendQoSEventUrl);

                // Reset work variables
                lastPlayerStateUpdateOrPlaybackSummaryEventSentTime = lastPlaybackStartOrPlaybackSummaryEventSentTime = Date.now();
                playingTimeMsInLastMinute = 0;
                bufferingTimeMsInLastMinute = 0;
                bufferingCountInLastMinute = 0;
                errorCountInLastMinute = 0;
            }
        }, 1000);
        // === Send off a QoS event every minute ===

        // Remove card
        function removeCard() {
            quizEl.classList.toggle("drop");
        }

        // Trigger quiz
        function triggerQuiz(metadataText) {
            let obj = JSON.parse(metadataText);

            quizEl.style.display = "";
            quizEl.classList.remove("drop");
            waitMessage.style.display = "none";
            cardInnerEl.style.display = "none";
            cardInnerEl.style.pointerEvents = "auto";

            while (answersEl.firstChild) answersEl.removeChild(answersEl.firstChild);
            questionEl.textContent = obj.question;

            let createAnswers = function (obj, i) {
                let q = document.createElement("a");
                let qText = document.createTextNode(obj.answers[i]);
                answersEl.appendChild(q);
                q.classList.add("answer");
                q.appendChild(qText);

                q.addEventListener("click", (event) => {
                    cardInnerEl.style.pointerEvents = "none";
                    if (q.textContent === obj.answers[obj.correctIndex]) {
                        q.classList.toggle("correct");
                    } else {
                        q.classList.toggle("wrong");
                    }

                    // === send off a timed metadata feedback event ===
                    sendQuizAnswer(sendQuizAnswerUrl, obj.question, q.textContent);
                    // === send off a timed metadata feedback event ===

                    setTimeout(function () {
                        removeCard();
                        waitMessage.style.display = "";
                    }, 1050);
                    return false;
                });
            };

            for (var i = 0; i < obj.answers.length; i++) {
                createAnswers(obj, i);
            }
            cardInnerEl.style.display = "";
            waitMessage.style.display = "";
        }

        // === Define and initialize QoS event work variables ===
        // timing control and auxiliary variables
        let hasBeenPlayingVideo = false;
        let lastPlayerStateREADYTime = -1; // milliseconds since Epoch, UTC, for computing startupLatencyMsOfThisSession
        let lastPlayerState = "";
        let lastPlayerStateUpdateOrPlaybackSummaryEventSentTime = -1; // milliseconds since Epoch, UTC, for computing playing/bufferingTimeMsInLastMinute
        let lastPlaybackStartOrPlaybackSummaryEventSentTime = -1; // milliseconds since Epoch, UTC, for the timing of sending playback summary events

        // payload of events
        let userId = ""; // unique UUID of each device if localStorage is supported, otherwise set to sessionId of each playback session
        let sessionId = ""; // unique UUID of each playback session
        let startupLatencyMsOfThisSession = 0;
        let playingTimeMsInLastMinute = 0;
        let bufferingTimeMsInLastMinute = 0;
        let bufferingCountInLastMinute = 0;
        let errorCountInLastMinute = 0;
        let lastQuality = undefined; // the latest rendition being played
        // === Define and initialize QoS event work variables ===

        // === subroutines for sending QoS events and timed metadata feedback events ===
        // Set the User and Session ID when the player loads a new video. The unique User ID is a random UUID, set as the very first
        //   Session ID of this user, and remains the same even different sessions are played.
        const setUserIDSessionID = () => {
            sessionId = player.getSessionId();

            if (typeof (Storage) !== "undefined") {
                if (!localStorage.getItem("ivs_qos_user_id")) {
                    localStorage.setItem("ivs_qos_user_id", sessionId);
                }
                userId = localStorage.getItem("ivs_qos_user_id");
            } else {
                console.log("Sorry! No web storage support. Use Session ID as User Id");
                userId = sessionId;
            }
        };

        const setPlayerStateVariables = myPlayerState => {
            lastPlayerState = myPlayerState;
            lastPlayerStateUpdateOrPlaybackSummaryEventSentTime = Date.now();
        };

        // // Send off the last PLAYBACK_SUMMARY event and the STOP event
        // const sendOffLastPlaybackSummaryEventAndPlaybackEndEvent = () => {
        //     sendPlaybackSummaryEventIfNecessary(sendQoSEventUrl);
        //     sendPlaybackEndEvent(sendQoSEventUrl);
        // };

        // Send playback start (PLAY) event
        const sendPlaybackStartEvent = url => {
            // (Yueshi to do) send out PLAY event, including startupLatencyMsOfThisSession, myJson.startup_latency_ms
            const myJson = {};
            myJson.metric_type = "PLAY";

            myJson.user_id = userId;
            myJson.session_id = sessionId;

            myJson.client_platform = config.CLIENT_PLATFORM;
            myJson.is_live = isLiveChannel();
            myJson.channel_watched = getChannelWatched(myJson.is_live);

            myJson.start_playback_position_sec = Math.round(player.getPosition());
            myJson.startup_latency_ms = startupLatencyMsOfThisSession;

            if (url != "") {
                pushPayload(url, myJson);
            }

            console.log("send QoS event - Play ", JSON.stringify(myJson), " to ", url);
        };

        // Send playback end (STOP) event
        const sendPlaybackEndEvent = url => {
            const myJson = {};
            myJson.metric_type = "STOP";

            myJson.user_id = userId;
            myJson.session_id = sessionId;

            myJson.client_platform = config.CLIENT_PLATFORM;
            myJson.is_live = isLiveChannel();
            myJson.channel_watched = getChannelWatched(myJson.is_live);

            myJson.end_playback_position_sec = Math.round(player.getPosition());

            if (url != "") {
                pushPayload(url, myJson);
            }

            console.log("send QoS event - Stop ", JSON.stringify(myJson), " to ", url);
        };

        // Send playback QoS summary (PLAYBACK_SUMMARY) event
        const sendPlaybackSummaryEventIfNecessary = url => {
            if (lastPlayerState == "PLAYING") { // collect the uncounted time in the PLAYING state
                playingTimeMsInLastMinute += (Date.now() - lastPlayerStateUpdateOrPlaybackSummaryEventSentTime);
            } else if (lastPlayerState == "BUFFERING") { // Bcollect the uncounted time in the BUFFERING state
                bufferingTimeMsInLastMinute += (Date.now() - lastPlayerStateUpdateOrPlaybackSummaryEventSentTime);
            }

            if ((playingTimeMsInLastMinute > 0) || (bufferingTimeMsInLastMinute > 0)) {
                const myJson = {};
                myJson.metric_type = "PLAYBACK_SUMMARY";

                myJson.user_id = userId;
                myJson.session_id = sessionId;

                myJson.client_platform = config.CLIENT_PLATFORM;
                myJson.is_live = isLiveChannel();
                myJson.channel_watched = getChannelWatched(myJson.is_live);

                myJson.error_count = errorCountInLastMinute;
                myJson.playing_time_ms = playingTimeMsInLastMinute;
                myJson.buffering_time_ms = bufferingTimeMsInLastMinute;
                myJson.buffering_count = bufferingCountInLastMinute;
                myJson.rendition_name = lastQuality.name;
                myJson.rendition_height = lastQuality.height;
                if (myJson.is_live) {
                    myJson.live_latency_ms = Math.round(player.getLiveLatency() * 1000);
                } else {
                    myJson.live_latency_sec = -1;
                }

                if (url != "") {
                    pushPayload(url, myJson);
                }

                console.log("send QoS event - PlaybackSummary ", JSON.stringify(myJson), " to ", url);
            }
        };

        // Send quality (i.e., rendition) change (QUALITY_CHANGE) event
        function sendQualityChangedEvent(url, lastQuality, newQuality) {
            const myJson = {};
            myJson.metric_type = "QUALITY_CHANGED";

            myJson.user_id = userId;
            myJson.session_id = sessionId;

            myJson.client_platform = config.CLIENT_PLATFORM;
            myJson.is_live = isLiveChannel();
            myJson.channel_watched = getChannelWatched(myJson.is_live);

            myJson.from_rendition_name = lastQuality.name;
            myJson.to_rendition_name = newQuality.name;
            myJson.from_bitrate = lastQuality.bitrate;
            myJson.to_bitrate = newQuality.bitrate;
            myJson.step_direction = (newQuality.bitrate > lastQuality.bitrate) ? "UP" : "DOWN";

            if (url != "") {
                pushPayload(url, myJson);
            }

            console.log("send QoS event - QualityChanged ", JSON.stringify(myJson), " to ", url);
        }

        // Check whether the video being played is live or VOD
        // For now it is hardcorded to return 'true' always
        // VOD to be supported in future
        const isLiveChannel = () => {

            // return (player.getDuration() == Infinity);
            return true;
        };

        // Parse and get the Channel watched from the Playback URL
        const getChannelWatched = live => {
            if (live) {
                const myIndex1 = playbackUrl.indexOf("channel.") + 8;
                const myIndex2 = playbackUrl.indexOf(".m3u8");
                const channelName = playbackUrl.substring(myIndex1, myIndex2);
                console.log("playbackUrl ", playbackUrl);
                console.log("Channel name :", channelName);
                return channelName;
            } else {
                return playbackUrl;
            }
        };

        // Send timed metadata feedback event
        const sendQuizAnswer = (url, question, answer) => {
            const myJson = {};
            myJson.metric_type = "QUIZ_ANSWER";

            myJson.user_id = userId;
            myJson.session_id = sessionId;

            myJson.question = question;
            myJson.answer = answer;

            if (url != "") {
                pushPayload(url, myJson);
            }

            console.log("send timed metadata feedback event - QuizAnswer ", JSON.stringify(myJson), " to ", url);
        };

        const pushPayload = (endpoint, payload) => {
            let wrapPayload = {};
            wrapPayload.Records = [];
            let record = {
                Data: payload
            };
            wrapPayload.Records.push(record);
            console.log("Record :%j", wrapPayload);

            const axiosConfig = {
                headers:{
                    "Content-Type": "application/json"
                }
            }
            axios
                .post(endpoint, wrapPayload, axiosConfig)
                .then((response) => {
                    console.log("Success ");
                })
                .catch((error) => {
                    console.error("Error:", error);
                });
        };
        // === subroutines for sending QoS events and timed metadata events ===
    }, []); // eslint-disable-line

    return (
        // <div>
            <div className="player-wrapper">
                <div className="aspect-169 pos-relative full-width full-height">
                    <video
                        id="video-player"
                        className="video-elem pos-absolute full-width"
                        playsInline
                        muted
                    ></video>
                    <div className="quiz-wrap">
                        <div id="waiting"><span className="waiting-text float">Waiting for the next question</span></div>
                        <div id="quiz" className="card drop">
                            <div id="card-inner">
                                <h2 id="question"></h2>
                                <div id="answers"></div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
            // <div className="quiz-wrap">
            //     <div id="waiting"><span className="waiting-text float">Waiting for the next question</span></div>
            //     <div id="quiz" className="card drop">
            //         <div id="card-inner">
            //             <h2 id="question"></h2>
            //             <div id="answers"></div>
            //         </div>
            //     </div>
            // </div>
        // </div>
    );
};

export default VideoPlayer;
