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
    ],
    'mod_smartvideo_get_course_categories' => [
        'classname'   => 'mod_smartvideo\external\get_course_categories',
        'methodname'  => 'execute',
        'description' => 'Get Question Bank categories for the current course',
        'type'        => 'read',
        'ajax'        => true,
    ],
    'mod_smartvideo_get_category_questions' => [
        'classname'   => 'mod_smartvideo\external\get_category_questions',
        'methodname'  => 'execute',
        'description' => 'Get ready questions in a specific Question Bank category',
        'type'        => 'read',
        'ajax'        => true,
    ],
    'mod_smartvideo_save_cuepoint' => [
        'classname'   => 'mod_smartvideo\external\save_cuepoint',
        'methodname'  => 'execute',
        'description' => 'Create or update an interactive question cuepoint on the video timeline',
        'type'        => 'write',
        'ajax'        => true,
    ],
    'mod_smartvideo_delete_cuepoint' => [
        'classname'   => 'mod_smartvideo\external\delete_cuepoint',
        'methodname'  => 'execute',
        'description' => 'Delete an interactive question cuepoint and its attempts',
        'type'        => 'write',
        'ajax'        => true,
    ],
    'mod_smartvideo_get_question_attempt' => [
        'classname'   => 'mod_smartvideo\external\get_question_attempt',
        'methodname'  => 'execute',
        'description' => 'Get or start a question attempt for in-video interactive playback',
        'type'        => 'write',
        'ajax'        => true,
    ],
    'mod_smartvideo_submit_question_attempt' => [
        'classname'   => 'mod_smartvideo\external\submit_question_attempt',
        'methodname'  => 'execute',
        'description' => 'Submit student response to in-video question and evaluate correctness',
        'type'        => 'write',
        'ajax'        => true,
    ],
];
