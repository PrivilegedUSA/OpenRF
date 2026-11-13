"""Offline-first SDR capability contract; does NOT open a radio or run rtl_power.

v0.2.42 only implements browser-local visualization of user-chosen rtl_power CSV
and explicitly synthetic DEMO. Presence of an executable is not proof of a
receiver, a tuned frequency, calibrated power, or a successful sample.
"""
from __future__ import annotations

import shutil
from datetime import datetime, timezone

SPECTRUM_CONTRACT_VERSION = 1


def capability_report(*, executable_lookup=None, collected_at=None) -> dict:
    lookup = executable_lookup or shutil.which
    rtl_power = bool(lookup('rtl_power'))
    rtl_test = bool(lookup('rtl_test'))
    return {
        'schema_version': SPECTRUM_CONTRACT_VERSION,
        'collected_at_utc': collected_at or datetime.now(timezone.utc).isoformat(timespec='seconds'),
        'mode': 'OFFLINE_FILE_ANALYSIS_ONLY',
        'hardware_capture_enabled': False,
        'hardware_confirmed': False,
        'tooling': {
            'rtl_power_installed': rtl_power,
            'rtl_test_installed': rtl_test,
            'status': 'tools_present_unverified' if rtl_power or rtl_test else 'tools_not_found',
        },
        'driver_contract': {
            'format': 'rtl_power_csv_v1',
            'source_type': 'operator_selected_local_file',
            'expected_columns': ['date', 'time', 'start_hz', 'stop_hz', 'step_hz', 'sample_count', 'power_db_bins'],
            'frequency_unit': 'Hz in source; MHz in display',
            'amplitude_unit': 'rtl_power reported dB (NOT calibrated dBm)',
            'timestamp_note': 'CSV date/time timezone is not verified; never assume UTC',
            'no_source_location': True,
            'live_sampling': 'NOT IMPLEMENTED',
            'future_receiver_fields': ['receiver_identity', 'driver', 'sample_utc', 'sample_age_seconds', 'center_hz', 'span_hz', 'gain_db', 'calibration_status'],
        },
        'privacy': {'upload_required': False, 'data_stored_on_server': False,
                    'automatic_background_collection': False},
        'limitations': [
            'Viewing a CSV is offline analysis, not proof of present radio activity.',
            'DEMO bins are artificial, never recorded observations or live RF detections.',
            'An installed rtl_power tool does not establish that any USB receiver is attached or supported.',
            'Frequency controls filter the display; they do not tune any hardware.',
        ],
    }
