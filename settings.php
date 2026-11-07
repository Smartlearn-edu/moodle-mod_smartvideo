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
 * Admin settings for mod_smartvideo.
 *
 * @package    mod_smartvideo
 * @copyright  2025 Mohammad Nabil <mohammad@smartlearn.education>
 * @license    https://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */

defined('MOODLE_INTERNAL') || die();

if ($ADMIN->fulltree) {
    require_once($CFG->dirroot . '/mod/smartvideo/lib.php');

    $providers = [
        'securelibrary' => get_string('provider_securelibrary', 'mod_smartvideo'),
        'youtube'       => get_string('provider_youtube', 'mod_smartvideo'),
        'vimeo'         => get_string('provider_vimeo', 'mod_smartvideo'),
        'html5video'    => get_string('provider_html5video', 'mod_smartvideo'),
        'bunnystream'   => get_string('provider_bunnystream', 'mod_smartvideo'),
        'vdocipher'     => get_string('provider_vdocipher', 'mod_smartvideo'),
        'dailymotion'   => get_string('provider_dailymotion', 'mod_smartvideo'),
        'wistia'        => get_string('provider_wistia', 'mod_smartvideo'),
        'screenpal'     => get_string('provider_screenpal', 'mod_smartvideo'),
    ];

    $defaultsources = array_keys($providers);
    $defaultsourcesmap = array_combine($defaultsources, $defaultsources);

    $settings->add(new admin_setting_configmulticheckbox(
        'mod_smartvideo/videosources',
        get_string('videosources', 'mod_smartvideo'),
        get_string('videosources_desc', 'mod_smartvideo'),
        $defaultsourcesmap,
        $providers
    ));

    $defaultsourcelist = [
        'securelibrary' => get_string('provider_securelibrary', 'mod_smartvideo'),
        'youtube'       => get_string('provider_youtube', 'mod_smartvideo'),
        'vimeo'         => get_string('provider_vimeo', 'mod_smartvideo'),
        'html5video'    => get_string('provider_html5video', 'mod_smartvideo'),
        'bunnystream'   => get_string('provider_bunnystream', 'mod_smartvideo'),
        'vdocipher'     => get_string('provider_vdocipher', 'mod_smartvideo'),
        'dailymotion'   => get_string('provider_dailymotion', 'mod_smartvideo'),
        'wistia'        => get_string('provider_wistia', 'mod_smartvideo'),
        'screenpal'     => get_string('provider_screenpal', 'mod_smartvideo'),
    ];

    $settings->add(new admin_setting_configselect(
        'mod_smartvideo/defaultvideosource',
        get_string('defaultvideosource', 'mod_smartvideo'),
        get_string('defaultvideosource_desc', 'mod_smartvideo'),
        'securelibrary',
        $defaultsourcelist
    ));

    $settings->add(new admin_setting_configpasswordunmask(
        'mod_smartvideo/auth_vdocipher',
        get_string('auth_vdocipher', 'mod_smartvideo'),
        get_string('auth_vdocipher_desc', 'mod_smartvideo'),
        ''
    ));
}
