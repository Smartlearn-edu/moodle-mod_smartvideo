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
 * Defines backup_smartvideo_activity_task class.
 *
 * @package    mod_smartvideo
 * @category   backup
 * @copyright  2025 Mohammad Nabil <mohammad@smartlearn.education>
 * @license    https://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */

defined('MOODLE_INTERNAL') || die();

require_once($CFG->dirroot . '/mod/smartvideo/backup/moodle2/backup_smartvideo_stepslib.php');

/**
 * Provides the steps to perform one complete backup of the smartvideo instance.
 */
class backup_smartvideo_activity_task extends backup_activity_task {
    /**
     * No specific settings for this activity.
     */
    protected function define_my_settings(): void {
    }

    /**
     * Defines a backup step to store the instance data in the smartvideo.xml file.
     */
    protected function define_my_steps(): void {
        $this->add_step(new backup_smartvideo_activity_structure_step(
            'smartvideo_structure',
            'smartvideo.xml'
        ));
    }

    /**
     * Encodes URLs to the index.php and view.php scripts.
     *
     * @param string $content some HTML text that eventually contains URLs to the activity instance scripts
     * @return string the content with the URLs encoded
     */
    public static function encode_content_links($content): string {
        global $CFG;

        $base = preg_quote($CFG->wwwroot, '/');

        // Link to the list of smartvideos.
        $search = '/(' . $base . '\/mod\/smartvideo\/index\.php\?id\=)([0-9]+)/';
        $content = preg_replace($search, '$@SMARTVIDEOINDEX*$2@$', $content);

        // Link to smartvideo view by moduleid.
        $search = '/(' . $base . '\/mod\/smartvideo\/view\.php\?id\=)([0-9]+)/';
        $content = preg_replace($search, '$@SMARTVIDEOVIEWBYID*$2@$', $content);

        return $content;
    }
}
