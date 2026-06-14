# 🗄️ Ballers League — Supabase Schema Documentation

This document outlines the database updates required to support **Division 2 (Ballers League 2)**, **Promotion/Relegation**, **Clubs management**, and **Season features**.

## 1. New Tables Added

### `promotions_relegations`
Tracks the history of teams moving between Division 1 and Division 2 at the end of each season.
* `id` (`SERIAL PRIMARY KEY`): Unique entry ID.
* `season_id` (`INTEGER REFERENCES seasons(id) ON DELETE CASCADE`): The season during which the transfer happened.
* `team_id` (`INTEGER REFERENCES teams(id) ON DELETE CASCADE`): The team that moved.
* `direction` (`TEXT`): Either `'promoted'` or `'relegated'`.
* `from_division` (`INTEGER`): The division they moved from.
* `to_division` (`INTEGER`): The division they moved to.
* `created_at` (`TIMESTAMPTZ`): Timestamp of the promotion/relegation transition.

### `clubs`
A central dictionary of real-world football clubs, their logo assets, and CSS colors for UI rendering.
* `id` (`SERIAL PRIMARY KEY`): Unique club ID.
* `name` (`TEXT UNIQUE`): Name of the club (e.g., `'Chelsea'`).
* `logo_url` (`TEXT`): Path to the club's logo image.
* `primary_color` (`TEXT`): Hex code for primary brand color (e.g., `'#034694'`).
* `text_color` (`TEXT`): Hex code for matching text color (e.g., `'#fff'`).
* `short_name` (`TEXT`): Short code abbreviation (e.g., `'CHE'`).

---

## 2. Table Column Extensions

### `teams` Table Extensions
* `division` (`INTEGER`, default `1`): Set to `1` for Division 1, and `2` for Division 2.
* `is_active` (`BOOLEAN`, default `true`): Tracks if a team profile is currently active or archived.

### `matches` Table Extensions
* `division` (`INTEGER`, default `1`): Distinguishes whether the match is a Division 1 league match, Division 2 league match, or cup match.

### `seasons` Table Extensions
* `headline` (`TEXT`, default `NULL`): Customizable marquee headline for the season.
* `deductions` (`JSONB`, default `'{}'`): Dictionary mapping team IDs to points deductions for the season standings (e.g., `{"3": 3}` to deduct 3 points from Liverpool).
