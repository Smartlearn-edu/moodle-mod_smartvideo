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
 * Web service declarations for mod_smartvideo.
 *
 * @package    mod_smartvideo
 * @copyright  2025 Mohammad Nabil <mohammad@smartlearn.education>
 * @license    https://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */

defined('MOODLE_INTERNAL') || die();

$functions = [
    'mod_smartvideo_update_progress' => [
        'classname'   => 'mod_smartvideo\external\update_progress',
        'methodname'  => 'execute',
        'description' => 'Update student watch progress, bookmark and evaluate completion',
        'type'        => 'write',
        'ajax'        => true,
        'services'    => [MOODLE_OFFICIAL_MOBILE_SERVICE],
    ],
    'mod_smartvideo_get_course_categories' => [
        'classname'   => 'mod_smartvideo\external\get_course_categories',
        'methodname'  => 'execute',
        'description' => 'Get Question Bank categories for the current course',
        'type'        => 'read',
        'ajax'        => true,
        'services'    => [MOODLE_OFFICIAL_MOBILE_SERVICE],
    ],
    'mod_smartvideo_get_category_questions' => [
        'classname'   => 'mod_smartvideo\external\get_category_questions',
        'methodname'  => 'execute',
        'description' => 'Get ready questions in a specific Question Bank category',
        'type'        => 'read',
        'ajax'        => true,
        'services'    => [MOODLE_OFFICIAL_MOBILE_SERVICE],
    ],
    'mod_smartvideo_save_cuepoint' => [
        'classname'   => 'mod_smartvideo\external\save_cuepoint',
        'methodname'  => 'execute',
        'description' => 'Create or update an interactive question cuepoint on the video timeline',
        'type'        => 'write',
        'ajax'        => true,
        'services'    => [MOODLE_OFFICIAL_MOBILE_SERVICE],
    ],
    'mod_smartvideo_delete_cuepoint' => [
        'classname'   => 'mod_smartvideo\external\delete_cuepoint',
        'methodname'  => 'execute',
        'description' => 'Delete an interactive question cuepoint and its attempts',
        'type'        => 'write',
        'ajax'        => true,
        'services'    => [MOODLE_OFFICIAL_MOBILE_SERVICE],
    ],
    'mod_smartvideo_get_question_attempt' => [
        'classname'   => 'mod_smartvideo\external\get_question_attempt',
        'methodname'  => 'execute',
        'description' => 'Get or start a question attempt for in-video interactive playback',
        'type'        => 'write',
        'ajax'        => true,
        'services'    => [MOODLE_OFFICIAL_MOBILE_SERVICE],
    ],
    'mod_smartvideo_submit_question_attempt' => [
        'classname'   => 'mod_smartvideo\external\submit_question_attempt',
        'methodname'  => 'execute',
        'description' => 'Submit student response to in-video question and evaluate correctness',
        'type'        => 'write',
        'ajax'        => true,
        'services'    => [MOODLE_OFFICIAL_MOBILE_SERVICE],
    ],
    'mod_smartvideo_save_chapter' => [
        'classname'   => 'mod_smartvideo\external\save_chapter',
        'methodname'  => 'execute',
        'description' => 'Create or update a video chapter marker',
        'type'        => 'write',
        'ajax'        => true,
        'services'    => [MOODLE_OFFICIAL_MOBILE_SERVICE],
    ],
    'mod_smartvideo_delete_chapter' => [
        'classname'   => 'mod_smartvideo\external\delete_chapter',
        'methodname'  => 'execute',
        'description' => 'Delete a video chapter marker',
        'type'        => 'write',
        'ajax'        => true,
        'services'    => [MOODLE_OFFICIAL_MOBILE_SERVICE],
    ],
    'mod_smartvideo_save_callout' => [
        'classname'   => 'mod_smartvideo\external\save_callout',
        'methodname'  => 'execute',
        'description' => 'Create or update an in-video callout card',
        'type'        => 'write',
        'ajax'        => true,
        'services'    => [MOODLE_OFFICIAL_MOBILE_SERVICE],
    ],
    'mod_smartvideo_delete_callout' => [
        'classname'   => 'mod_smartvideo\external\delete_callout',
        'methodname'  => 'execute',
        'description' => 'Delete an in-video callout card',
        'type'        => 'write',
        'ajax'        => true,
        'services'    => [MOODLE_OFFICIAL_MOBILE_SERVICE],
    ],
    'mod_smartvideo_create_quick_question' => [
        'classname'   => 'mod_smartvideo\external\create_quick_question',
        'methodname'  => 'execute',
        'description' => 'Quickly create a Multiple Choice or True/False question in Question Bank and link to timeline',
        'type'        => 'write',
        'ajax'        => true,
        'services'    => [MOODLE_OFFICIAL_MOBILE_SERVICE],
    ],
    'mod_smartvideo_get_notes' => [
        'classname'   => 'mod_smartvideo\external\get_notes',
        'methodname'  => 'execute',
        'description' => 'Get current student notes for this video activity',
        'type'        => 'read',
        'ajax'        => true,
        'services'    => [MOODLE_OFFICIAL_MOBILE_SERVICE],
    ],
    'mod_smartvideo_save_note' => [
        'classname'   => 'mod_smartvideo\external\save_note',
        'methodname'  => 'execute',
        'description' => 'Create or update a student timestamped note',
        'type'        => 'write',
        'ajax'        => true,
        'services'    => [MOODLE_OFFICIAL_MOBILE_SERVICE],
    ],
    'mod_smartvideo_delete_note' => [
        'classname'   => 'mod_smartvideo\external\delete_note',
        'methodname'  => 'execute',
        'description' => 'Delete a student note',
        'type'        => 'write',
        'ajax'        => true,
        'services'    => [MOODLE_OFFICIAL_MOBILE_SERVICE],
    ],
    'mod_smartvideo_get_report' => [
        'classname'   => 'mod_smartvideo\external\get_report',
        'methodname'  => 'execute',
        'description' => 'Get current student structured medical/case report',
        'type'        => 'read',
        'ajax'        => true,
        'services'    => [MOODLE_OFFICIAL_MOBILE_SERVICE],
    ],
    'mod_smartvideo_save_report' => [
        'classname'   => 'mod_smartvideo\external\save_report',
        'methodname'  => 'execute',
        'description' => 'Save or submit a structured student medical/case report',
        'type'        => 'write',
        'ajax'        => true,
        'services'    => [MOODLE_OFFICIAL_MOBILE_SERVICE],
    ],
    'mod_smartvideo_get_subtitles' => [
        'classname'   => 'mod_smartvideo\external\get_subtitles',
        'methodname'  => 'execute',
        'description' => 'Get configured WebVTT subtitle tracks and parsed cues',
        'type'        => 'read',
        'ajax'        => true,
        'services'    => [MOODLE_OFFICIAL_MOBILE_SERVICE],
    ],
    'mod_smartvideo_save_subtitles' => [
        'classname'   => 'mod_smartvideo\external\save_subtitles',
        'methodname'  => 'execute',
        'description' => 'Save or upload WebVTT subtitle content',
        'type'        => 'write',
        'ajax'        => true,
        'services'    => [MOODLE_OFFICIAL_MOBILE_SERVICE],
    ],
    'mod_smartvideo_delete_subtitles' => [
        'classname'   => 'mod_smartvideo\external\delete_subtitles',
        'methodname'  => 'execute',
        'description' => 'Delete a WebVTT subtitle track',
        'type'        => 'write',
        'ajax'        => true,
        'services'    => [MOODLE_OFFICIAL_MOBILE_SERVICE],
    ],
    'mod_smartvideo_get_discussions' => [
        'classname'   => 'mod_smartvideo\external\get_discussions',
        'methodname'  => 'execute',
        'description' => 'Get timestamped student and instructor Q&A discussions',
        'type'        => 'read',
        'ajax'        => true,
        'services'    => [MOODLE_OFFICIAL_MOBILE_SERVICE],
    ],
    'mod_smartvideo_post_discussion' => [
        'classname'   => 'mod_smartvideo\external\post_discussion',
        'methodname'  => 'execute',
        'description' => 'Post a timestamped question or reply to discussion',
        'type'        => 'write',
        'ajax'        => true,
        'services'    => [MOODLE_OFFICIAL_MOBILE_SERVICE],
    ],
    'mod_smartvideo_delete_discussion' => [
        'classname'   => 'mod_smartvideo\external\delete_discussion',
        'methodname'  => 'execute',
        'description' => 'Delete a discussion comment or question',
        'type'        => 'write',
        'ajax'        => true,
        'services'    => [MOODLE_OFFICIAL_MOBILE_SERVICE],
    ],
];
