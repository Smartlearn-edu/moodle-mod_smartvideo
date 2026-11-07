<?php
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
 * English strings for mod_smartvideo.
 *
 * @package    mod_smartvideo
 * @copyright  2025 Mohammad Nabil <mohammad@smartlearn.education>
 * @license    https://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */

defined('MOODLE_INTERNAL') || die();

$string['pluginname'] = 'Smart Video';
$string['modulename'] = 'Smart Video';
$string['modulenameplural'] = 'Smart Videos';
$string['modulename_help'] = 'Interactive smart video player with HLS streaming, question bank checkpoints, dynamic moving watermark, and granular watch-time completion tracking.';
$string['pluginadministration'] = 'Smart Video administration';

// Capabilities.
$string['smartvideo:addinstance'] = 'Add a new Smart Video activity';
$string['smartvideo:view'] = 'View the Smart Video activity';
$string['smartvideo:viewreports'] = 'View student watch progress reports';
$string['smartvideo:managequestions'] = 'Manage interactive questions in Smart Video';

// Activity Form & Video Selection.
$string['videoselection'] = 'Video Selection';
$string['selectvideo'] = 'Select Video';
$string['selectfromlibrary'] = 'Select from Video Library';
$string['novideoselected'] = 'No video selected yet.';
$string['selectedvideo'] = 'Selected Video:';
$string['changevideo'] = 'Change Video';
$string['uploadnewvideo'] = 'Upload New Video';
$string['refreshlist'] = 'Refresh List';
$string['loadingvideos'] = 'Loading videos from library...';
$string['searchvideos'] = 'Search videos...';
$string['scope_my'] = 'My uploads';
$string['scope_course'] = 'Course videos';
$string['scope_all'] = 'All accessible';
$string['selectthisvideo'] = 'Select This Video';
$string['err_novideoselected'] = 'You must select a video from the library to save this activity.';

// Playback & Security Options.
$string['playbacksecurity'] = 'Playback & Security Options';
$string['watermarkenabled'] = 'Enable dynamic moving watermark';
$string['watermarkenabled_help'] = 'If enabled, a floating semi-transparent watermark displaying the student\'s name, user ID, IP address, and live clock will move across the screen to deter screen recordings and unauthorized distribution.';
$string['watermarkopacity'] = 'Watermark opacity (%)';
$string['watermarkopacity_help'] = 'Set the opacity of the moving watermark overlay between 10% and 100% (default: 35%).';
$string['preventseeking'] = 'Prevent forward seeking';
$string['preventseeking_help'] = 'If enabled, students cannot skip ahead or scrub forward past the furthest point they have legitimately watched.';

// Completion Rules.
$string['completionminpercent'] = 'Require minimum watch percentage';
$string['completionminpercent_help'] = 'If set (e.g. 80%), the activity will only be marked complete once the student has uniquely watched at least this percentage of the video. Scrubbing or skipping ahead without watching does not count towards completion.';
$string['completionminpercent_desc'] = 'Student must watch at least {$a}% of the video';

// Player UI Strings.
$string['resumeprompt'] = 'You previously watched up to {$a}. Would you like to resume?';
$string['resume'] = 'Resume';
$string['startover'] = 'Start Over';
$string['watchprogress'] = 'Watched: {$a->percent}% (Target: {$a->min}%)';
$string['watchprogress_no_min'] = 'Watched: {$a}%';
$string['novideowarning'] = 'No valid video has been linked to this activity yet.';
$string['videonotready'] = 'This video is currently being transcoded and encrypted. Please check back in a few moments.';
$string['tamperwarning'] = 'Security warning: Watermark tampering detected. Video playback has been paused.';
$string['play'] = 'Play';
$string['pause'] = 'Pause';
$string['mute'] = 'Mute';
$string['unmute'] = 'Unmute';
$string['fullscreen'] = 'Fullscreen';
$string['exitfullscreen'] = 'Exit Fullscreen';
$string['speed'] = 'Speed';
$string['quality'] = 'Quality';
$string['auto'] = 'Auto';
$string['seekinglocked'] = 'Forward seeking is disabled for this activity.';

// Teacher Report.
$string['report'] = 'Watch Progress Report';
$string['report_title'] = 'Student Watch Progress Report';
$string['report_summary_total'] = 'Enrolled Students';
$string['report_summary_completed'] = 'Completed';
$string['report_summary_avg'] = 'Average Watch Progress';
$string['student'] = 'Student';
$string['percentcompleted'] = 'Progress';
$string['watchedtime'] = 'Unique Time Watched';
$string['lastposition'] = 'Last Position';
$string['status'] = 'Status';
$string['completed'] = 'Completed';
$string['in_progress'] = 'In Progress';
$string['notstarted'] = 'Not Started';
$string['backtovideo'] = 'Back to Video';
$string['lastupdated'] = 'Last Updated';
$string['nostudentsfound'] = 'No enrolled students found in this course.';

// Interactive Questions & Question Bank Integration.
$string['interactivequestions'] = 'Interactive Questions';
$string['questions'] = 'Interactive Questions';
$string['managequestions'] = 'Manage Interactive Questions';
$string['managequestions_desc'] = 'Add questions from your course Question Bank to pause the video at specific timestamps and verify student comprehension.';
$string['addquestion'] = 'Add Question';
$string['addquestionat'] = 'Add Question at {$a}';
$string['editquestion'] = 'Edit Question';
$string['deletequestion'] = 'Delete Question';
$string['deletequestionconfirm'] = 'Are you sure you want to remove this interactive question from the video? Student attempts for this question will also be removed.';
$string['timecode'] = 'Timestamp (seconds or MM:SS)';
$string['timecode_help'] = 'The exact playback position where the video will pause and display this question.';
$string['questiontitle'] = 'Label / Title';
$string['questiontitle_default'] = 'Knowledge Check';
$string['questionbank'] = 'Question Bank';
$string['questioncategory'] = 'Question Category';
$string['choosecategory'] = 'Choose a category...';
$string['selectquestion'] = 'Select Question';
$string['choosequestion'] = 'Choose a question...';
$string['questionpreview'] = 'Question Preview';
$string['requirecorrect'] = 'Require correct answer to continue';
$string['requirecorrect_help'] = 'If enabled, the video will remain paused until the student answers the question correctly.';
$string['rewindto'] = 'If wrong answer, go to';
$string['rewindto_help'] = 'Target playback time to jump back to if the student answers incorrectly (e.g. 03:00). Leave empty to allow immediate retries in place without jumping.';
$string['retryonspot'] = 'Retry in place';
$string['questionstyle'] = 'Question display style';
$string['questionstyle_help'] = 'Choose how the interactive question appears inside the video player: Compact Modern Card (optimized for video playback) or Native Moodle Quiz (standard Quiz appearance with info block).';
$string['questionstyle_compact'] = 'Compact Modern Card (Recommended)';
$string['questionstyle_native'] = 'Native Moodle Quiz';
$string['togglestyle'] = 'Switch Question Style';
$string['rewindonfail'] = 'Rewind on incorrect answer';
$string['rewindonfail_help'] = 'Number of seconds to rewind the video if the student answers incorrectly, encouraging them to review the explanation. Choose 0 to allow immediate retries in place.';
$string['rewind_none'] = '0 seconds (allow retry in place)';
$string['rewind_seconds'] = '{$a} seconds';
$string['noquestionsconfigured'] = 'No interactive questions have been added to this video yet.';
$string['noquestionsincategory'] = 'No ready questions found in this category.';
$string['invalidquestion'] = 'Invalid or missing question from the Question Bank.';
$string['jumpto'] = 'Jump to';
$string['savecuepoint'] = 'Save Question';
$string['questioncount'] = 'Questions: {$a}';
$string['completionrequirequestions'] = 'Require all interactive questions passed';
$string['completionrequirequestions_help'] = 'If enabled, the activity is only marked complete once the student has correctly answered all interactive questions.';
$string['completionrequirequestions_desc'] = 'Student must pass all {$a} interactive questions';

// Player In-Video Question Overlay Strings.
$string['knowledgecheck'] = 'Knowledge Check';
$string['submitanswer'] = 'Submit Answer';
$string['submitting'] = 'Submitting...';
$string['answercorrect'] = 'Correct! Great job.';
$string['answerincorrect'] = 'Incorrect. Please try again.';
$string['continuevideo'] = 'Continue Video';
$string['tryagain'] = 'Try Again';
$string['retakequestion'] = 'Retake Question';
$string['resetmyattempts'] = 'Reset My Test Attempts';
$string['resetmyattempts_desc'] = 'Reset your own watch progress and question attempts for testing purposes.';
$string['rewindingnotice'] = 'Incorrect answer. Rewinding {$a} seconds to review the explanation...';
$string['questionpassed'] = 'Completed';
$string['questionpending'] = 'Pending';
$string['questionsprogress'] = 'Questions: {$a->passed}/{$a->total} passed';
$string['questiongateactive'] = 'You must answer the interactive question before proceeding.';

// Report strings.
$string['interactivequestionscol'] = 'Questions Passed';
$string['interactivequestions_summary'] = 'Passed {$a->passed} of {$a->total} ({$a->percent}%)';
$string['noquestionsactivity'] = 'No interactive questions';

// Privacy API.
$string['privacy:metadata:smartvideo_progress'] = 'Stores watch progress, bookmarks, and completion tracking for each student.';
$string['privacy:metadata:smartvideo_progress:userid'] = 'The user ID of the student.';
$string['privacy:metadata:smartvideo_progress:lastposition'] = 'The last playback timestamp in seconds for resume bookmarking.';
$string['privacy:metadata:smartvideo_progress:maxposition'] = 'The furthest position reached in seconds for forward-seek locking.';
$string['privacy:metadata:smartvideo_progress:watchedseconds'] = 'Total unique seconds watched across sessions.';
$string['privacy:metadata:smartvideo_progress:percentcompleted'] = 'Calculated percentage of video watched.';
$string['privacy:metadata:smartvideo_progress:timemodified'] = 'The timestamp when progress was last recorded.';
$string['privacy:metadata:smartvideo_qattempts'] = 'Stores student attempts, scores, and pass status for in-video interactive questions.';
$string['privacy:metadata:smartvideo_qattempts:userid'] = 'The ID of the student answering the question.';
$string['privacy:metadata:smartvideo_qattempts:svquestionid'] = 'The ID of the interactive question cuepoint.';
$string['privacy:metadata:smartvideo_qattempts:passed'] = 'Whether the student answered the question correctly.';
$string['privacy:metadata:smartvideo_qattempts:attempts'] = 'The number of attempts made by the student.';
$string['privacy:metadata:smartvideo_qattempts:fraction'] = 'The score fraction obtained from the question engine.';
$string['privacy:metadata:smartvideo_qattempts:timemodified'] = 'The timestamp of the last attempt interaction.';
$string['privacy:metadata:core_question'] = 'The Smart Video activity uses Moodle\'s Question Engine subsystem to evaluate and store interactive question attempts.';

// Workstation Sidebar & 3-Zone Architecture.
$string['workstation_tools'] = 'Workstation Tools';
$string['sidebar_toggle'] = 'Toggle Workstation Sidebar';
$string['sidebar_split_mode'] = 'Side-by-side view';
$string['sidebar_overlay_mode'] = 'Overlay view';
$string['dock_to_sidebar'] = 'Dock to Sidebar';
$string['move_below'] = 'Move Below Video';
$string['close_sidebar'] = 'Close Sidebar';
$string['resize_sidebar'] = 'Drag to resize sidebar';

// Chapters & Table of Contents.
$string['chapters'] = 'Chapters';
$string['chapter'] = 'Chapter';
$string['addchapter'] = 'Add Chapter';
$string['editchapter'] = 'Edit Chapter';
$string['deletechapter'] = 'Delete Chapter';
$string['deletechapterconfirm'] = 'Are you sure you want to delete this chapter marker?';
$string['chaptertitle'] = 'Chapter Title';
$string['nochapters'] = 'No chapters defined yet.';
$string['tableofcontents'] = 'Table of Contents';

// Callout Cards.
$string['callouts'] = 'Callout Cards';
$string['callout'] = 'Callout Card';
$string['addcallout'] = 'Add Callout Card';
$string['editcallout'] = 'Edit Callout Card';
$string['deletecallout'] = 'Delete Callout Card';
$string['deletecalloutconfirm'] = 'Are you sure you want to delete this callout card?';
$string['callouttitle'] = 'Card Title / Heading';
$string['calloutbody'] = 'Card Content';
$string['calloutduration'] = 'Display Duration (seconds)';
$string['calloutautopause'] = 'Auto-pause video when card appears';
$string['calloutlinkurl'] = 'Action Button Link URL';
$string['calloutlinklabel'] = 'Action Button Label';
$string['calloutposition'] = 'Card Position';
$string['nocallouts'] = 'No callout cards configured yet.';

// Quick Questions.
$string['quickquestion'] = 'Quick Question';
$string['createquickquestion'] = 'Create Quick Question';
$string['quickquestion_desc'] = 'Quickly create a Multiple Choice or True/False question and add it directly to this video timestamp.';
$string['questiontype'] = 'Question Type';
$string['multichoice'] = 'Multiple Choice';
$string['truefalse'] = 'True / False';
$string['questionprompt'] = 'Question Prompt';
$string['answerchoices'] = 'Answer Choices';
$string['correctanswer'] = 'Correct Answer';
$string['addchoice'] = 'Add Another Choice';
$string['removechoice'] = 'Remove Choice';
$string['choice'] = 'Choice {$a}';
$string['true'] = 'True';
$string['false'] = 'False';

// Timeline Studio.
$string['timelinestudio'] = 'Timeline Studio';
$string['timelinestudio_desc'] = 'Manage interactive questions, chapters, and rich callouts along your video timeline.';
$string['tab_questions'] = 'Questions';
$string['tab_chapters'] = 'Chapters';
$string['tab_callouts'] = 'Callout Cards';
$string['fromquestionbank'] = 'Question Bank';
$string['quickcreator'] = 'Quick Creator';
$string['savechapter'] = 'Save Chapter';
$string['savecallout'] = 'Save Callout';
$string['addchapterat'] = 'Add Chapter at {$a}';
$string['addcalloutat'] = 'Add Callout at {$a}';
$string['chaptercount'] = 'Chapters: {$a}';
$string['calloutcount'] = 'Callout Cards: {$a}';

// Student Timestamped Notes.
$string['notes'] = 'Notes';
$string['studentnotes'] = 'Personal Notes';
$string['addnote'] = 'Add Note';
$string['addnotecurrent'] = 'Add Note at {$a}';
$string['noteprompt'] = 'Type your timestamped note here...';
$string['nonotes'] = 'You haven\'t added any notes yet. Jot down key ideas while watching!';
$string['exportnotes'] = 'Export Notes';
$string['printnotes'] = 'Print Notes';
$string['deletenoteconfirm'] = 'Are you sure you want to delete this note?';
$string['notecreated'] = 'Note added at {$a}';

// Clinical & Scientific Calculator.
$string['calculator'] = 'Calculator';
$string['calc_scientific'] = 'Scientific Calculator';
$string['calc_clinical'] = 'Clinical Presets';
$string['calc_bmi'] = 'BMI (Body Mass Index)';
$string['calc_map'] = 'MAP (Mean Arterial Pressure)';
$string['calc_egfr'] = 'eGFR (CKD-EPI)';

// Structured Medical & Case Report.
$string['medicalreport'] = 'Case Report';
$string['findings'] = 'Clinical Findings';
$string['findings_placeholder'] = 'Document key symptoms, signs, or video findings. Click "Cite Time" to link video evidence...';
$string['impression'] = 'Diagnostic Impression';
$string['impression_placeholder'] = 'Primary hypothesis or overall impression...';
$string['differential'] = 'Differential Diagnosis';
$string['differential_placeholder'] = 'Alternative diagnoses considered and rationale...';
$string['recommendations'] = 'Action Plan / Management';
$string['recommendations_placeholder'] = 'Next steps, recommended tests, monitoring or treatment...';
$string['savedraft'] = 'Save Draft';
$string['submitreport'] = 'Submit Report';
$string['reportsubmitted'] = 'Report Submitted';
$string['citetime'] = 'Cite Time';
$string['lastsaved'] = 'Saved {$a}';
$string['draftsaved'] = 'Draft saved';
$string['reports'] = 'Student Case Reports';
$string['viewreport'] = 'View Report';

// Closed Captions & Interactive Transcript.
$string['captions'] = 'Closed Captions';
$string['captions_toggle'] = 'Toggle Closed Captions';
$string['captions_off'] = 'Off';
$string['subtitles'] = 'Subtitles';
$string['transcript'] = 'Transcript';
$string['searchtranscript'] = 'Search in transcript...';
$string['notranscript'] = 'No transcript or subtitles available for this video.';
$string['addsubtitles'] = 'Add Subtitles';
$string['subtitleslang'] = 'Subtitle Language';
$string['vttcontent'] = 'WebVTT Content';
$string['savesubtitles'] = 'Save Subtitles';
$string['deletesubtitlesconfirm'] = 'Are you sure you want to delete this subtitle track?';

// Handouts & Resources.
$string['resources'] = 'Handouts & Resources';
$string['resources_help'] = 'Upload supplementary files such as PDF slides, lecture notes, or handouts. These will appear in the Handouts & Resources tab beneath the video player for students to download.';
$string['resources_desc'] = 'Lecture handouts, slides, and reference files attached to this activity.';
$string['noresources'] = 'No handouts or files attached to this video.';
$string['downloadfile'] = 'Download File';

// Timestamped Q&A / Discussions.
$string['discussions'] = 'Q&A Discussions';
$string['askquestion'] = 'Ask a Question';
$string['askquestionat'] = 'Ask at {$a}';
$string['questionplaceholder'] = 'Ask a question or share an observation (optionally tied to video timestamp)...';
$string['reply'] = 'Reply';
$string['replyplaceholder'] = 'Write a reply...';
$string['postquestion'] = 'Post Question';
$string['postreply'] = 'Post Reply';
$string['nodiscussions'] = 'No questions asked yet. Be the first to start a discussion!';
$string['deletediscussionconfirm'] = 'Are you sure you want to delete this comment and its replies?';
$string['dock_below'] = 'Move Below Video';
$string['dock_to_sidebar'] = 'Dock to Sidebar';

// Audience Retention & Engagement Heatmap.
$string['engagement_heatmap'] = 'Audience Retention & Engagement Heatmap';
$string['heatmap_desc'] = 'Visualizes second-by-second student retention, drop-offs, and high-frequency re-watch spikes across the video.';
$string['retention_rate'] = 'Retention Rate';
$string['rewatch_spikes'] = 'Re-watch Spikes';

// Video Providers & Sources.
$string['provider_securelibrary'] = 'Secure Video Library (Local Encrypted HLS)';
$string['provider_youtube'] = 'YouTube';
$string['provider_vimeo'] = 'Vimeo';
$string['provider_html5video'] = 'Direct Video Link / HTML5 / HLS';
$string['provider_bunnystream'] = 'Bunny Stream';
$string['provider_vdocipher'] = 'VdoCipher';
$string['provider_dailymotion'] = 'Dailymotion';
$string['provider_wistia'] = 'Wistia';
$string['provider_screenpal'] = 'ScreenPal';

// Admin Settings.
$string['videosources'] = 'Allowed Video Sources';
$string['videosources_desc'] = 'Select which video hosting providers and source types are available to teachers when creating or editing Smart Video activities.';
$string['defaultvideosource'] = 'Default Video Source';
$string['defaultvideosource_desc'] = 'Default video source selected in the activity settings form.';
$string['auth_vdocipher'] = 'VdoCipher API Secret Key';
$string['auth_vdocipher_desc'] = 'Your VdoCipher Secret Key (found in your VdoCipher Dashboard under Configuration / API Keys). Required only if VdoCipher is enabled.';

// Form & Activity Configuration.
$string['sourcetype'] = 'Video Source';
$string['sourcetype_library'] = 'Secure Video Library (Local Encrypted HLS)';
$string['sourcetype_external'] = 'External Video URL (YouTube, Vimeo, Bunny, etc.)';
$string['videourl'] = 'Video URL or ID';
$string['videourl_help'] = 'Paste a URL from YouTube, Vimeo, Bunny Stream, VdoCipher, Dailymotion, Wistia, or a direct link to an MP4, WebM, or HLS (.m3u8) video stream.';
$string['videourlplaceholder'] = 'https://www.youtube.com/watch?v=... or https://vimeo.com/... or https://.../video.mp4';
$string['fetchingmetadata'] = 'Detecting video provider and fetching details...';
$string['invalidvideourl'] = 'Invalid or unsupported video URL. Please check the URL and ensure the provider is enabled.';
$string['videodetected'] = 'Detected {$a->provider}: {$a->title} ({$a->duration})';
$string['vdocipher_apikey_missing'] = 'VdoCipher API Secret Key is not configured in site administration.';
$string['supportedproviders'] = 'Supported Providers: YouTube, Vimeo, Bunny Stream, VdoCipher, Dailymotion, Wistia, Direct MP4/HLS';





