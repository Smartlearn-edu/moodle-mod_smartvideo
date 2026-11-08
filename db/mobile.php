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
 * Moodle Mobile App (Site Plugins) addon definitions for mod_smartvideo.
 *
 * @package    mod_smartvideo
 * @copyright  2025 Mohammad Nabil <mohammad@smartlearn.education>
 * @license    https://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */

defined('MOODLE_INTERNAL') || die();

$addons = [
    'mod_smartvideo' => [
        'handlers' => [
            'smartvideoview' => [
                'delegate' => 'CoreCourseModuleDelegate',
                'method' => 'mobile_course_view',
                'displaydata' => [
                    'icon' => $CFG->wwwroot . '/mod/smartvideo/pix/icon.svg',
                ],
                'offlinefunctions' => [
                    'mobile_course_view' => [],
                ],
            ],
        ],
        'lang' => [
            ['pluginname', 'mod_smartvideo'],
            ['overview', 'mod_smartvideo'],
            ['duration', 'mod_smartvideo'],
            ['dismiss', 'mod_smartvideo'],
            ['openlink', 'mod_smartvideo'],
            ['required', 'mod_smartvideo'],
            ['resumeprompt', 'mod_smartvideo'],
            ['resume', 'mod_smartvideo'],
            ['startover', 'mod_smartvideo'],
            ['novideowarning', 'mod_smartvideo'],
            ['videonotready', 'mod_smartvideo'],
            ['invalidvideourl', 'mod_smartvideo'],
            ['play', 'mod_smartvideo'],
            ['pause', 'mod_smartvideo'],
            ['mute', 'mod_smartvideo'],
            ['unmute', 'mod_smartvideo'],
            ['fullscreen', 'mod_smartvideo'],
            ['exitfullscreen', 'mod_smartvideo'],
            ['speed', 'mod_smartvideo'],
            ['seekinglocked', 'mod_smartvideo'],
            ['percentcompleted', 'mod_smartvideo'],
            ['watchedtime', 'mod_smartvideo'],
            ['completed', 'mod_smartvideo'],
            ['in_progress', 'mod_smartvideo'],
            ['knowledgecheck', 'mod_smartvideo'],
            ['questions', 'mod_smartvideo'],
            ['submitanswer', 'mod_smartvideo'],
            ['submitting', 'mod_smartvideo'],
            ['answercorrect', 'mod_smartvideo'],
            ['answerincorrect', 'mod_smartvideo'],
            ['continuevideo', 'mod_smartvideo'],
            ['tryagain', 'mod_smartvideo'],
            ['retakequestion', 'mod_smartvideo'],
            ['questionpassed', 'mod_smartvideo'],
            ['questionpending', 'mod_smartvideo'],
            ['questiongateactive', 'mod_smartvideo'],
            ['noquestionsconfigured', 'mod_smartvideo'],
            ['chapters', 'mod_smartvideo'],
            ['nochapters', 'mod_smartvideo'],
            ['callouts', 'mod_smartvideo'],
            ['nocallouts', 'mod_smartvideo'],
            ['notes', 'mod_smartvideo'],
            ['studentnotes', 'mod_smartvideo'],
            ['addnote', 'mod_smartvideo'],
            ['noteprompt', 'mod_smartvideo'],
            ['nonotes', 'mod_smartvideo'],
            ['medicalreport', 'mod_smartvideo'],
            ['findings', 'mod_smartvideo'],
            ['findings_placeholder', 'mod_smartvideo'],
            ['impression', 'mod_smartvideo'],
            ['impression_placeholder', 'mod_smartvideo'],
            ['differential', 'mod_smartvideo'],
            ['differential_placeholder', 'mod_smartvideo'],
            ['recommendations', 'mod_smartvideo'],
            ['recommendations_placeholder', 'mod_smartvideo'],
            ['savedraft', 'mod_smartvideo'],
            ['submitreport', 'mod_smartvideo'],
            ['reportsubmitted', 'mod_smartvideo'],
            ['citetime', 'mod_smartvideo'],
            ['draftsaved', 'mod_smartvideo'],
            ['captions', 'mod_smartvideo'],
            ['transcript', 'mod_smartvideo'],
            ['notranscript', 'mod_smartvideo'],
            ['resources', 'mod_smartvideo'],
            ['noresources', 'mod_smartvideo'],
            ['downloadfile', 'mod_smartvideo'],
            ['discussions', 'mod_smartvideo'],
            ['askquestion', 'mod_smartvideo'],
            ['questionplaceholder', 'mod_smartvideo'],
            ['reply', 'mod_smartvideo'],
            ['replyplaceholder', 'mod_smartvideo'],
            ['postquestion', 'mod_smartvideo'],
            ['postreply', 'mod_smartvideo'],
            ['nodiscussions', 'mod_smartvideo'],
            ['watchedpercent', 'mod_smartvideo'],
            ['targetpercent', 'mod_smartvideo'],
            ['submit', 'moodle'],
            ['delete', 'moodle'],
        ],
    ],
];
