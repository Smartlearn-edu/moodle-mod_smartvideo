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
 * English strings for mod_securevideo.
 *
 * @package    mod_securevideo
 * @copyright  2025 Mohammad Nabil <mohammad@smartlearn.education>
 * @license    https://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */

defined('MOODLE_INTERNAL') || die();

$string['pluginname'] = 'Secure Video';
$string['modulename'] = 'Secure Video';
$string['modulenameplural'] = 'Secure Videos';
$string['modulename_help'] = 'Protected HTML5 video player with AES-128 HLS encryption, anti-download shielding, dynamic moving watermark, and granular watch-time completion tracking.';
$string['pluginadministration'] = 'Secure Video administration';

// Capabilities.
$string['securevideo:addinstance'] = 'Add a new secure video activity';
$string['securevideo:view'] = 'View the secure video activity';
$string['securevideo:viewreports'] = 'View student watch progress reports';

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
$string['privacy:metadata:securevideo_progress'] = 'Stores watch progress, bookmarks, and completion tracking for each student.';
$string['privacy:metadata:securevideo_progress:userid'] = 'The user ID of the student.';
$string['privacy:metadata:securevideo_progress:lastposition'] = 'The last playback timestamp in seconds for resume bookmarking.';
$string['privacy:metadata:securevideo_progress:maxposition'] = 'The furthest position reached in seconds for forward-seek locking.';
$string['privacy:metadata:securevideo_progress:watchedseconds'] = 'Total unique seconds watched across sessions.';
$string['privacy:metadata:securevideo_progress:percentcompleted'] = 'Calculated percentage of video watched.';
$string['privacy:metadata:securevideo_progress:timemodified'] = 'The timestamp when progress was last recorded.';
$string['privacy:metadata:securevideo_qattempts'] = 'Stores student attempts, scores, and pass status for in-video interactive questions.';
$string['privacy:metadata:securevideo_qattempts:userid'] = 'The ID of the student answering the question.';
$string['privacy:metadata:securevideo_qattempts:svquestionid'] = 'The ID of the interactive question cuepoint.';
$string['privacy:metadata:securevideo_qattempts:passed'] = 'Whether the student answered the question correctly.';
$string['privacy:metadata:securevideo_qattempts:attempts'] = 'The number of attempts made by the student.';
$string['privacy:metadata:securevideo_qattempts:fraction'] = 'The score fraction obtained from the question engine.';
$string['privacy:metadata:securevideo_qattempts:timemodified'] = 'The timestamp of the last attempt interaction.';
$string['privacy:metadata:core_question'] = 'The Secure Video activity uses Moodle\'s Question Engine subsystem to evaluate and store interactive question attempts.';
