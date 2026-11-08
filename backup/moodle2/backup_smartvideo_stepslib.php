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
 * Define all the backup steps for mod_smartvideo.
 *
 * @package    mod_smartvideo
 * @category   backup
 * @copyright  2025 Mohammad Nabil <mohammad@smartlearn.education>
 * @license    https://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */

/**
 * Define the complete smartvideo structure for backup.
 */
class backup_smartvideo_activity_structure_step extends backup_activity_structure_step {
    /**
     * Define the structure of the backup.
     *
     * @return backup_nested_element
     */
    protected function define_structure(): backup_nested_element {
        // Define root activity element.
        $smartvideo = new backup_nested_element('smartvideo', ['id'], [
            'name',
            'intro',
            'introformat',
            'videosource',
            'videourl',
            'duration',
            'posterimage',
            'displayinline',
            'displayoptions',
            'mediaid',
            'watermarkenabled',
            'watermarkopacity',
            'preventseeking',
            'completionminpercent',
            'completionrequirequestions',
            'timecreated',
            'timemodified',
        ]);

        $questions = new backup_nested_element('questions');
        $question = new backup_nested_element('question', ['id'], [
            'questionbankentryid',
            'questionid',
            'timecode',
            'title',
            'requirecorrect',
            'rewindonfail',
            'timecreated',
            'timemodified',
        ]);

        $smartvideo->add_child($questions);
        $questions->add_child($question);

        // Sources.
        $smartvideo->set_source_table('smartvideo', ['id' => backup::VAR_ACTIVITYID]);
        $question->set_source_table('smartvideo_questions', ['instanceid' => backup::VAR_PARENTID]);

        // Annotations.
        $question->annotate_ids('question', 'questionid');
        $smartvideo->annotate_files('mod_smartvideo', 'intro', null);

        return $this->prepare_activity_structure($smartvideo);
    }
}
