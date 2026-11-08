// This file is part of Moodle - http://moodle.org/
//
// Moodle is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// Moodle is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU General Public License for more details.
//
// You should have received a copy of the GNU General Public License
// along with Moodle.  If not, see <https://www.gnu.org/licenses/>.

/**
 * Moodle Mobile App (Site Plugins) runtime controller for mod_smartvideo.
 *
 * @package    mod_smartvideo
 * @copyright  2025 Mohammad Nabil <mohammad@smartlearn.education>
 * @license    https://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */
(function(t) {
    'use strict';

    var parseJsonSafe = function(str, fallback) {
        if (!str) {
            return fallback;
        }
        if (typeof str !== 'string') {
            return str;
        }
        try {
            return JSON.parse(str);
        } catch (e) {
            return fallback;
        }
    };

    var formatSeconds = function(total) {
        var s = Math.max(0, Math.floor(Number(total) || 0));
        var hrs = Math.floor(s / 3600);
        var mins = Math.floor((s % 3600) / 60);
        var secs = s % 60;
        var pad = function(n) {
            return n < 10 ? '0' + n : String(n);
        };
        if (hrs > 0) {
            return pad(hrs) + ':' + pad(mins) + ':' + pad(secs);
        }
        return pad(mins) + ':' + pad(secs);
    };

    var mergeIntervals = function(intervals) {
        if (!Array.isArray(intervals) || !intervals.length) {
            return {merged: [], totalSeconds: 0};
        }
        var valid = intervals
            .map(function(pair) {
                return [Math.max(0, Math.floor(Number(pair[0]) || 0)), Math.max(0, Math.floor(Number(pair[1]) || 0))];
            })
            .filter(function(pair) {
                return pair[1] > pair[0];
            })
            .sort(function(a, b) {
                return a[0] - b[0];
            });

        if (!valid.length) {
            return {merged: [], totalSeconds: 0};
        }

        var merged = [valid[0]];
        for (var i = 1; i < valid.length; i++) {
            var last = merged[merged.length - 1];
            var curr = valid[i];
            if (curr[0] <= last[1] + 1) {
                last[1] = Math.max(last[1], curr[1]);
            } else {
                merged.push(curr);
            }
        }

        var totalSeconds = 0;
        for (var j = 0; j < merged.length; j++) {
            totalSeconds += (merged[j][1] - merged[j][0]);
        }
        return {merged: merged, totalSeconds: totalSeconds};
    };

    // Hydrate structured lists from scalar JSON otherdata.
    t.questionsList = parseJsonSafe(t.CONTENT_OTHERDATA.questionsjson, []);
    t.chaptersList = parseJsonSafe(t.CONTENT_OTHERDATA.chaptersjson, []);
    t.calloutsList = parseJsonSafe(t.CONTENT_OTHERDATA.calloutsjson, []);
    t.cuesList = parseJsonSafe(t.CONTENT_OTHERDATA.cuesjson, []);
    t.notesList = parseJsonSafe(t.CONTENT_OTHERDATA.notesjson, []);
    t.discussionsList = parseJsonSafe(t.CONTENT_OTHERDATA.discussionsjson, []);
    t.watchedIntervals = parseJsonSafe(t.CONTENT_OTHERDATA.watchedintervals, []);

    t.activeCallout = null;
    t.activeQuestion = null;
    t.dismissedCalloutIds = {};
    t.triggeredQuestionAtSecond = -1;
    t.videoEl = null;
    t.hlsInstance = null;
    t.lastTickSecond = null;

    var callWS = function(wsName, params) {
        if (t.CoreSitePluginsProvider && typeof t.CoreSitePluginsProvider.callWS === 'function') {
            return t.CoreSitePluginsProvider.callWS(wsName, params, {getFromCache: false, saveToCache: false});
        }
        if (t.CoreSitesProvider) {
            var site = t.CoreSitesProvider.getCurrentSite();
            if (site) {
                return site.write(wsName, params);
            }
        }
        return Promise.reject(new Error('Web service provider unavailable'));
    };

    var exitNativeFullscreenIfActive = function(video) {
        if (!video) {
            return;
        }
        try {
            if (video.webkitDisplayingFullscreen && typeof video.webkitExitFullscreen === 'function') {
                video.webkitExitFullscreen();
            } else if (document.fullscreenElement && typeof document.exitFullscreen === 'function') {
                document.exitFullscreen();
            }
        } catch (e) {
            // Ignore fullscreen exit errors on restricted WebViews.
        }
    };

    var syncProgressToServer = function() {
        var cmid = Number(t.CONTENT_OTHERDATA.cmid) || 0;
        if (!cmid) {
            return;
        }
        var mergedInfo = mergeIntervals(t.watchedIntervals);
        t.watchedIntervals = mergedInfo.merged;
        var watchedSecs = Math.max(Number(t.CONTENT_OTHERDATA.watchedseconds) || 0, mergedInfo.totalSeconds);
        t.CONTENT_OTHERDATA.watchedseconds = watchedSecs;
        t.CONTENT_OTHERDATA.watchedintervals = JSON.stringify(t.watchedIntervals);

        callWS('mod_smartvideo_update_progress', {
            cmid: cmid,
            currentposition: Math.floor(Number(t.CONTENT_OTHERDATA.currenttime) || 0),
            maxposition: Math.floor(Number(t.CONTENT_OTHERDATA.maxposition) || 0),
            watchedseconds: watchedSecs,
            watchedintervals: t.CONTENT_OTHERDATA.watchedintervals
        }).then(function(res) {
            if (res && typeof res.percentcompleted !== 'undefined') {
                t.CONTENT_OTHERDATA.percentcompleted = Number(res.percentcompleted) || 0;
            }
        }).catch(function() {
            // Silently ignore transient network hiccups during playback heartbeat.
        });
    };

    var parseQuestionHtml = function(attemptData) {
        var parser = new DOMParser();
        var doc = parser.parseFromString(attemptData.html || '', 'text/html');
        var qtextEl = doc.querySelector('.qtext');
        var promptHtml = qtextEl ? qtextEl.innerHTML : (attemptData.title || '');

        var hiddenInputs = {};
        var allInputs = doc.querySelectorAll('input[type="hidden"]');
        for (var i = 0; i < allInputs.length; i++) {
            var h = allInputs[i];
            if (h.name) {
                hiddenInputs[h.name] = h.value || '';
            }
        }

        var choices = [];
        var answerInputs = doc.querySelectorAll('.answer input[type="radio"], .answer input[type="checkbox"]');
        for (var j = 0; j < answerInputs.length; j++) {
            var inp = answerInputs[j];
            if (!inp.name || inp.value === '-1') {
                continue;
            }
            var labelHtml = '';
            if (inp.id) {
                var lbl = doc.querySelector('label[for="' + inp.id + '"]');
                if (lbl) {
                    labelHtml = lbl.innerHTML;
                }
            }
            if (!labelHtml && inp.parentElement) {
                var clone = inp.parentElement.cloneNode(true);
                var inputsInClone = clone.querySelectorAll('input');
                for (var k = 0; k < inputsInClone.length; k++) {
                    inputsInClone[k].remove();
                }
                labelHtml = clone.innerHTML;
            }
            choices.push({
                name: inp.name,
                value: inp.value,
                type: inp.type.toLowerCase(),
                selected: Boolean(inp.checked),
                labelHtml: labelHtml.trim() || inp.value
            });
        }

        var isTextInput = false;
        var textInputName = '';
        var textValue = '';
        if (!choices.length) {
            var txtInp = doc.querySelector('.answer input[type="text"], .answer textarea, .answer select');
            if (txtInp && txtInp.name) {
                isTextInput = true;
                textInputName = txtInp.name;
                textValue = txtInp.value || '';
            }
        }

        return {
            svquestionid: Number(attemptData.svquestionid),
            title: attemptData.title || '',
            timecode: Number(attemptData.timecode) || 0,
            timeformatted: formatSeconds(attemptData.timecode || 0),
            requirecorrect: Number(attemptData.requirecorrect) || 0,
            promptHtml: promptHtml,
            hiddenInputs: hiddenInputs,
            choices: choices,
            isTextInput: isTextInput,
            textInputName: textInputName,
            textValue: textValue
        };
    };

    var triggerQuestionAttempt = function(qItem, forceNew) {
        if (t.videoEl && !t.videoEl.paused) {
            t.videoEl.pause();
        }
        exitNativeFullscreenIfActive(t.videoEl);

        t.CONTENT_OTHERDATA.questionfeedbackhtml = '';
        t.CONTENT_OTHERDATA.questioncancontinue = 0;
        t.CONTENT_OTHERDATA.questioniscorrect = 0;
        t.CONTENT_OTHERDATA.questionsubmitting = 0;

        callWS('mod_smartvideo_get_question_attempt', {
            cmid: Number(t.CONTENT_OTHERDATA.cmid),
            svquestionid: Number(qItem.id),
            forcenew: Boolean(forceNew)
        }).then(function(res) {
            if (!res) {
                return;
            }
            t.activeQuestion = parseQuestionHtml(res);
            if (res.passed) {
                t.CONTENT_OTHERDATA.questioniscorrect = 1;
                t.CONTENT_OTHERDATA.questioncancontinue = 1;
            }
        }).catch(function() {
            // Allow student to continue if question cannot be fetched offline.
        });
    };

    t.selectQuestionChoice = function(choice) {
        if (!t.activeQuestion || !t.activeQuestion.choices) {
            return;
        }
        if (choice.type === 'radio') {
            for (var i = 0; i < t.activeQuestion.choices.length; i++) {
                t.activeQuestion.choices[i].selected = (t.activeQuestion.choices[i] === choice);
            }
        } else {
            choice.selected = !choice.selected;
        }
    };

    t.submitActiveQuestion = function() {
        if (!t.activeQuestion || t.CONTENT_OTHERDATA.questionsubmitting) {
            return;
        }
        var payload = {};
        var hidden = t.activeQuestion.hiddenInputs || {};
        Object.keys(hidden).forEach(function(k) {
            payload[k] = hidden[k];
        });

        if (t.activeQuestion.choices && t.activeQuestion.choices.length) {
            for (var i = 0; i < t.activeQuestion.choices.length; i++) {
                var ch = t.activeQuestion.choices[i];
                if (ch.selected) {
                    payload[ch.name] = ch.value;
                }
            }
        } else if (t.activeQuestion.isTextInput && t.activeQuestion.textInputName) {
            payload[t.activeQuestion.textInputName] = t.activeQuestion.textValue || '';
        }

        t.CONTENT_OTHERDATA.questionsubmitting = 1;
        callWS('mod_smartvideo_submit_question_attempt', {
            cmid: Number(t.CONTENT_OTHERDATA.cmid),
            svquestionid: Number(t.activeQuestion.svquestionid),
            formdata: JSON.stringify(payload)
        }).then(function(res) {
            t.CONTENT_OTHERDATA.questionsubmitting = 0;
            if (!res) {
                return;
            }
            t.CONTENT_OTHERDATA.questioniscorrect = res.is_correct ? 1 : 0;
            t.CONTENT_OTHERDATA.questioncancontinue = res.can_continue ? 1 : 0;
            t.CONTENT_OTHERDATA.questionfeedbackhtml = res.feedback_html || ' ';

            if (res.passed) {
                for (var idx = 0; idx < t.questionsList.length; idx++) {
                    if (Number(t.questionsList[idx].id) === Number(t.activeQuestion.svquestionid)) {
                        t.questionsList[idx].passed = true;
                    }
                }
            } else if (typeof res.rewind_to === 'number' && res.rewind_to >= 0 && !res.can_continue) {
                if (t.videoEl) {
                    t.videoEl.currentTime = res.rewind_to;
                }
            }
        }).catch(function() {
            t.CONTENT_OTHERDATA.questionsubmitting = 0;
        });
    };

    t.retryActiveQuestion = function() {
        if (!t.activeQuestion) {
            return;
        }
        triggerQuestionAttempt({id: t.activeQuestion.svquestionid}, true);
    };

    t.continueAfterQuestion = function() {
        t.activeQuestion = null;
        t.CONTENT_OTHERDATA.questionfeedbackhtml = '';
        t.CONTENT_OTHERDATA.questioncancontinue = 0;
        if (t.videoEl) {
            t.videoEl.play().catch(function() {});
        }
    };

    t.openQuestionFromList = function(q) {
        t.seekToSeconds(q.timecode);
        triggerQuestionAttempt(q, false);
    };

    t.togglePlay = function() {
        if (!t.videoEl) {
            return;
        }
        if (t.activeQuestion && !t.CONTENT_OTHERDATA.questioncancontinue) {
            return;
        }
        if (t.videoEl.paused) {
            t.videoEl.play().catch(function() {});
        } else {
            t.videoEl.pause();
        }
    };

    t.toggleMute = function() {
        if (!t.videoEl) {
            return;
        }
        t.videoEl.muted = !t.videoEl.muted;
        t.CONTENT_OTHERDATA.ismuted = t.videoEl.muted ? 1 : 0;
    };

    t.toggleCaptions = function() {
        t.CONTENT_OTHERDATA.captionsenabled = t.CONTENT_OTHERDATA.captionsenabled ? 0 : 1;
    };

    t.cyclePlaybackSpeed = function() {
        var rates = [1, 1.25, 1.5, 1.75, 2, 0.75];
        var current = Number(t.CONTENT_OTHERDATA.playbackrate) || 1;
        var nextIdx = (rates.indexOf(current) + 1) % rates.length;
        var nextRate = rates[nextIdx];
        t.CONTENT_OTHERDATA.playbackrate = String(nextRate);
        if (t.videoEl) {
            t.videoEl.playbackRate = nextRate;
        }
    };

    t.toggleFullscreen = function() {
        var stage = document.getElementById('smartVideoMobileStage');
        if (document.fullscreenElement) {
            document.exitFullscreen().catch(function() {});
            return;
        }
        if (stage && typeof stage.requestFullscreen === 'function') {
            stage.requestFullscreen().catch(function() {});
        } else if (t.videoEl && typeof t.videoEl.webkitEnterFullscreen === 'function') {
            t.videoEl.webkitEnterFullscreen();
        }
    };

    t.resumePlayback = function() {
        t.CONTENT_OTHERDATA.showresumetoast = 0;
        if (t.videoEl) {
            t.videoEl.currentTime = Number(t.CONTENT_OTHERDATA.lastposition) || 0;
            t.videoEl.play().catch(function() {});
        }
    };

    t.startOverPlayback = function() {
        t.CONTENT_OTHERDATA.showresumetoast = 0;
        if (t.videoEl) {
            t.videoEl.currentTime = 0;
            t.videoEl.play().catch(function() {});
        }
    };

    t.dismissCallout = function() {
        if (t.activeCallout) {
            t.dismissedCalloutIds[t.activeCallout.id] = true;
            t.activeCallout = null;
        }
    };

    t.seekToSeconds = function(targetSec) {
        if (!t.videoEl) {
            return;
        }
        var desired = Math.max(0, Number(targetSec) || 0);
        if (t.CONTENT_OTHERDATA.preventseeking) {
            var maxAllowed = Number(t.CONTENT_OTHERDATA.maxposition) || 0;
            if (desired > maxAllowed + 2) {
                desired = maxAllowed;
            }
        }
        t.videoEl.currentTime = desired;
    };

    t.onSeekBarTap = function(ev) {
        if (!t.videoEl || !ev || !ev.currentTarget) {
            return;
        }
        var rect = ev.currentTarget.getBoundingClientRect();
        if (!rect.width) {
            return;
        }
        var ratio = Math.max(0, Math.min(1, (ev.clientX - rect.left) / rect.width));
        var dur = Number(t.CONTENT_OTHERDATA.duration) || t.videoEl.duration || 0;
        if (dur > 0) {
            t.seekToSeconds(ratio * dur);
        }
    };

    // Student Notes CRUD in-place.
    t.saveNote = function() {
        var text = (t.CONTENT_OTHERDATA.newnotecontent || '').trim();
        if (!text) {
            return;
        }
        var tc = Math.floor(Number(t.CONTENT_OTHERDATA.currenttime) || 0);
        callWS('mod_smartvideo_save_note', {
            cmid: Number(t.CONTENT_OTHERDATA.cmid),
            noteid: 0,
            timecode: tc,
            content: text
        }).then(function(res) {
            t.CONTENT_OTHERDATA.newnotecontent = '';
            if (res && res.note) {
                t.notesList.push(res.note);
                t.notesList.sort(function(a, b) {
                    return a.timecode - b.timecode;
                });
            }
        }).catch(function() {});
    };

    t.deleteNote = function(noteId) {
        callWS('mod_smartvideo_delete_note', {
            cmid: Number(t.CONTENT_OTHERDATA.cmid),
            noteid: Number(noteId)
        }).then(function(res) {
            if (res && res.status) {
                t.notesList = t.notesList.filter(function(n) {
                    return Number(n.id) !== Number(noteId);
                });
            }
        }).catch(function() {});
    };

    // Structured Clinical/Case Report CRUD in-place.
    t.citeTimeInReport = function() {
        var stamp = '[' + (t.CONTENT_OTHERDATA.currenttimeformatted || '00:00') + '] ';
        t.CONTENT_OTHERDATA.reportfindings = (t.CONTENT_OTHERDATA.reportfindings || '') +
            (t.CONTENT_OTHERDATA.reportfindings ? ' ' : '') + stamp;
    };

    t.saveCaseReport = function(status) {
        if (t.CONTENT_OTHERDATA.reportsaving) {
            return;
        }
        t.CONTENT_OTHERDATA.reportsaving = 1;
        callWS('mod_smartvideo_save_report', {
            cmid: Number(t.CONTENT_OTHERDATA.cmid),
            findings: t.CONTENT_OTHERDATA.reportfindings || '',
            impression: t.CONTENT_OTHERDATA.reportimpression || '',
            diagnosis: t.CONTENT_OTHERDATA.reportdiagnosis || '',
            recommendations: t.CONTENT_OTHERDATA.reportrecommendations || '',
            status: status || 'draft'
        }).then(function(res) {
            t.CONTENT_OTHERDATA.reportsaving = 0;
            if (res && res.status) {
                t.CONTENT_OTHERDATA.reportstatus = res.reportstatus || status;
                t.CONTENT_OTHERDATA.reportissubmitted = (t.CONTENT_OTHERDATA.reportstatus === 'submitted') ? 1 : 0;
            }
        }).catch(function() {
            t.CONTENT_OTHERDATA.reportsaving = 0;
        });
    };

    // Discussions CRUD in-place.
    t.toggleReplyBox = function(parentId) {
        if (Number(t.CONTENT_OTHERDATA.replyparentid) === Number(parentId)) {
            t.CONTENT_OTHERDATA.replyparentid = 0;
        } else {
            t.CONTENT_OTHERDATA.replyparentid = Number(parentId);
            t.CONTENT_OTHERDATA.replycontent = '';
        }
    };

    var refreshDiscussionsList = function() {
        callWS('mod_smartvideo_get_discussions', {
            cmid: Number(t.CONTENT_OTHERDATA.cmid)
        }).then(function(res) {
            if (res && Array.isArray(res.discussions)) {
                t.discussionsList = res.discussions;
            }
        }).catch(function() {});
    };

    t.postDiscussion = function(parentId) {
        var isReply = Number(parentId) > 0;
        var content = (isReply ? t.CONTENT_OTHERDATA.replycontent : t.CONTENT_OTHERDATA.newquestioncontent || '').trim();
        if (!content) {
            return;
        }
        var tc = isReply ? 0 : Math.floor(Number(t.CONTENT_OTHERDATA.currenttime) || 0);
        callWS('mod_smartvideo_post_discussion', {
            cmid: Number(t.CONTENT_OTHERDATA.cmid),
            parentid: Number(parentId) || 0,
            timecode: tc,
            content: content
        }).then(function(res) {
            if (res && res.status) {
                if (isReply) {
                    t.CONTENT_OTHERDATA.replycontent = '';
                    t.CONTENT_OTHERDATA.replyparentid = 0;
                } else {
                    t.CONTENT_OTHERDATA.newquestioncontent = '';
                }
                refreshDiscussionsList();
            }
        }).catch(function() {});
    };

    t.deleteDiscussion = function(discId) {
        callWS('mod_smartvideo_delete_discussion', {
            cmid: Number(t.CONTENT_OTHERDATA.cmid),
            discussionid: Number(discId)
        }).then(function(res) {
            if (res && res.status) {
                refreshDiscussionsList();
            }
        }).catch(function() {});
    };

    // Load HLS.js on Android/Chromium or use native HLS on iOS.
    var loadHlsLibrary = function() {
        return new Promise(function(resolve) {
            if (window.Hls) {
                resolve(window.Hls);
                return;
            }
            var script = document.createElement('script');
            script.src = 'https://cdn.jsdelivr.net/npm/hls.js@1.5.17/dist/hls.min.js';
            script.onload = function() {
                resolve(window.Hls || null);
            };
            script.onerror = function() {
                resolve(null);
            };
            document.head.appendChild(script);
        });
    };

    var initVideoPlayer = function() {
        var video = document.getElementById('smartVideoMobileElement');
        if (!video) {
            return;
        }
        t.videoEl = video;
        var streamUrl = t.CONTENT_OTHERDATA.playlisturl || '';
        if (!streamUrl) {
            return;
        }

        var attachStream = function() {
            var isM3u8 = streamUrl.indexOf('.m3u8') !== -1 || t.CONTENT_OTHERDATA.videotype === 'securelibrary';
            if (!isM3u8) {
                video.src = streamUrl;
                return;
            }

            loadHlsLibrary().then(function(Hls) {
                if (Hls && Hls.isSupported()) {
                    var hls = new Hls({
                        enableWorker: true,
                        xhrSetup: function(xhr, url) {
                            if (url && url.indexOf('key.php') !== -1) {
                                var match = /[?&]token=([a-fA-F0-9]+)/.exec(url);
                                if (match && match[1]) {
                                    xhr.setRequestHeader('X-Moodle-Player-Token', match[1]);
                                }
                            }
                        }
                    });
                    hls.loadSource(streamUrl);
                    hls.attachMedia(video);
                    t.hlsInstance = hls;
                } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
                    video.src = streamUrl;
                } else {
                    video.src = streamUrl;
                }
            });
        };

        video.addEventListener('loadedmetadata', function() {
            if (video.duration && isFinite(video.duration) && !t.CONTENT_OTHERDATA.duration) {
                t.CONTENT_OTHERDATA.duration = Math.floor(video.duration);
                t.CONTENT_OTHERDATA.durationformatted = formatSeconds(video.duration);
            }
        });

        video.addEventListener('play', function() {
            t.CONTENT_OTHERDATA.isplaying = 1;
            t.lastTickSecond = Math.floor(video.currentTime || 0);
        });

        video.addEventListener('pause', function() {
            t.CONTENT_OTHERDATA.isplaying = 0;
            t.lastTickSecond = null;
            syncProgressToServer();
        });

        video.addEventListener('ended', function() {
            t.CONTENT_OTHERDATA.isplaying = 0;
            t.lastTickSecond = null;
            syncProgressToServer();
        });

        video.addEventListener('seeking', function() {
            if (!t.CONTENT_OTHERDATA.preventseeking) {
                return;
            }
            var maxAllowed = Number(t.CONTENT_OTHERDATA.maxposition) || 0;
            if (video.currentTime > maxAllowed + 2) {
                video.currentTime = maxAllowed;
            }
        });

        video.addEventListener('timeupdate', function() {
            var cur = video.currentTime || 0;
            var curSec = Math.floor(cur);
            var dur = Number(t.CONTENT_OTHERDATA.duration) || video.duration || 0;

            if (t.CONTENT_OTHERDATA.preventseeking) {
                var maxPos = Number(t.CONTENT_OTHERDATA.maxposition) || 0;
                if (cur > maxPos + 3) {
                    video.currentTime = maxPos;
                    return;
                }
            }

            if (!video.paused && t.lastTickSecond !== null) {
                var delta = curSec - t.lastTickSecond;
                if (delta >= 1 && delta <= 4) {
                    t.watchedIntervals.push([t.lastTickSecond, curSec]);
                    var mergedInfo = mergeIntervals(t.watchedIntervals);
                    t.watchedIntervals = mergedInfo.merged;
                    t.CONTENT_OTHERDATA.watchedseconds = mergedInfo.totalSeconds;
                    if (dur > 0) {
                        var pct = Math.min(100, Math.round((mergedInfo.totalSeconds / dur) * 100));
                        if (pct > Number(t.CONTENT_OTHERDATA.percentcompleted)) {
                            t.CONTENT_OTHERDATA.percentcompleted = pct;
                        }
                    }
                }
            }
            t.lastTickSecond = curSec;

            t.CONTENT_OTHERDATA.currenttime = curSec;
            t.CONTENT_OTHERDATA.currenttimeformatted = formatSeconds(curSec);
            if (curSec > Number(t.CONTENT_OTHERDATA.maxposition)) {
                t.CONTENT_OTHERDATA.maxposition = curSec;
            }

            if (dur > 0) {
                t.CONTENT_OTHERDATA.progresspercent = Math.min(100, Number(((cur / dur) * 100).toFixed(2)));
                t.CONTENT_OTHERDATA.maxpercent = Math.min(
                    100,
                    Number(((Number(t.CONTENT_OTHERDATA.maxposition) / dur) * 100).toFixed(2))
                );
            }

            // Subtitle cues check.
            if (t.CONTENT_OTHERDATA.captionsenabled && t.cuesList && t.cuesList.length) {
                var foundCue = '';
                for (var cIdx = 0; cIdx < t.cuesList.length; cIdx++) {
                    var cue = t.cuesList[cIdx];
                    if (cur >= cue.start && cur <= cue.end) {
                        foundCue = cue.text;
                        break;
                    }
                }
                t.CONTENT_OTHERDATA.activecaption = foundCue;
            } else {
                t.CONTENT_OTHERDATA.activecaption = '';
            }

            // Timed callouts check.
            var foundCallout = null;
            for (var kIdx = 0; kIdx < t.calloutsList.length; kIdx++) {
                var co = t.calloutsList[kIdx];
                var coEnd = co.timecode + (co.duration || 8);
                if (curSec >= co.timecode && curSec <= coEnd && !t.dismissedCalloutIds[co.id]) {
                    foundCallout = co;
                    break;
                }
            }
            if (foundCallout && (!t.activeCallout || t.activeCallout.id !== foundCallout.id)) {
                t.activeCallout = foundCallout;
                if (foundCallout.autopause && !video.paused) {
                    video.pause();
                    exitNativeFullscreenIfActive(video);
                }
            } else if (!foundCallout && t.activeCallout) {
                t.activeCallout = null;
            }

            // Interactive question cuepoints check.
            if (!t.activeQuestion && t.triggeredQuestionAtSecond !== curSec) {
                for (var qIdx = 0; qIdx < t.questionsList.length; qIdx++) {
                    var q = t.questionsList[qIdx];
                    if (!q.passed && Math.abs(curSec - Number(q.timecode)) <= 1) {
                        t.triggeredQuestionAtSecond = curSec;
                        triggerQuestionAttempt(q, false);
                        break;
                    }
                }
            }
        });

        attachStream();
    };

    var initTimer = setTimeout(initVideoPlayer, 250);

    var watermarkInterval = setInterval(function() {
        if (t.CONTENT_OTHERDATA.watermarkenabled) {
            t.CONTENT_OTHERDATA.watermarktop = 10 + Math.floor(Math.random() * 68);
            t.CONTENT_OTHERDATA.watermarkleft = 6 + Math.floor(Math.random() * 58);
        }
    }, 4500);

    var heartbeatInterval = setInterval(function() {
        if (t.videoEl && !t.videoEl.paused) {
            syncProgressToServer();
        }
    }, 10000);

    t.ngOnDestroy = function() {
        clearTimeout(initTimer);
        clearInterval(watermarkInterval);
        clearInterval(heartbeatInterval);
        syncProgressToServer();
        if (t.hlsInstance) {
            try {
                t.hlsInstance.destroy();
            } catch (e) {}
            t.hlsInstance = null;
        }
    };
})(this);
