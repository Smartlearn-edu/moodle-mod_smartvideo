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

namespace mod_smartvideo\event;

/**
 * Event triggered when a smart video activity is viewed.
 *
 * @package    mod_smartvideo
 * @copyright  2025 Mohammad Nabil <mohammad@smartlearn.education>
 * @license    https://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */
class course_module_viewed extends \core\event\course_module_viewed {
    /**
     * Initialize the event data.
     *
     * @return void
     */
    protected function init(): void {
        $this->data['crud'] = 'r';
        $this->data['edulevel'] = self::LEVEL_PARTICIPATING;
        $this->data['objecttable'] = 'smartvideo';
    }

    /**
     * Get objecttable mapping.
     *
     * @return array
     */
    public static function get_objectid_mapping(): array {
        return ['db' => 'smartvideo', 'restore' => 'smartvideo'];
    }

    /**
     * Create event instance from course module.
     *
     * @param \cm_info|\stdClass $cm The course module.
     * @return static
     */
    public static function create_from_cm($cm): static {
        $context = \context_module::instance($cm->id);
        $event = static::create([
            'context'  => $context,
            'objectid' => (int)$cm->instance,
        ]);
        $event->add_record_snapshot('course_modules', $cm);
        return $event;
    }
}
