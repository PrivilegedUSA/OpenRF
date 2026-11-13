"""Read-only, source-aware historical investigation reporting. No network or third-party modules."""
from __future__ import annotations

from collections import Counter, defaultdict
from html import escape
from statistics import median

from .storage import now_iso

REPORT_VERSION = 1


def _measured_groups(observations: list[dict]) -> tuple[list[dict], int]:
    """Never mix devices, evidence sources, frequency, or dBm with quality %."""
    groups: dict[tuple, list[float]] = defaultdict(list)
    times: dict[tuple, list[str]] = defaultdict(list)
    for item in observations:
        identifier = (item.get('identifier') or '').strip()
        if not identifier:
            continue  # A shared label is not evidence of a shared device.
        for field, unit in (('rssi_dbm', 'dBm'), ('signal_quality_percent', '% NetworkManager quality')):
            value = item.get(field)
            if value is None:
                continue
            key = (item['kind'], item['source'], identifier, item.get('source_device') or '',
                   item.get('hardware_id') or '', item.get('frequency_mhz'), unit)
            groups[key].append(float(value))
            times[key].append(item['observed_at'])
    series = []
    for (kind, source, identifier, source_device, hardware_id, frequency, unit), values in groups.items():
        when = times[(kind, source, identifier, source_device, hardware_id, frequency, unit)]
        series.append({
            'kind': kind, 'source': source, 'identifier': identifier,
            'source_device': source_device, 'hardware_id': hardware_id,
            'frequency_mhz': frequency, 'unit': unit, 'count': len(values),
            'minimum': round(min(values), 2), 'median': round(median(values), 2),
            'maximum': round(max(values), 2),
            'first_observed_at': min(when), 'last_observed_at': max(when),
        })
    series.sort(key=lambda item: (-item['count'], item['kind'], item['identifier'], item['unit']))
    return series[:150], max(0, len(series) - 150)


def investigation_report(snapshot: dict) -> dict:
    """Transform an atomic DB snapshot into a portable, historical report model."""
    observations = snapshot['observations']
    captures = snapshot['captures']
    sources = dict(sorted(Counter(row['source'] for row in observations).items()))
    kinds = dict(sorted(Counter(row['kind'] for row in observations).items()))
    series, omitted_series = _measured_groups(observations)
    return {
        'format': 'openrf.investigation-report.v1', 'format_version': REPORT_VERSION,
        'generated_at_utc': now_iso(), 'data_status': 'HISTORICAL_SAVED_RECORDS_NOT_LIVE',
        'investigation': snapshot['session'],
        'options': {'include_demo': snapshot['include_demo'],
                    'include_coordinates': snapshot['include_coordinates']},
        'summary': {'observations_included': len(observations),
                    'observations_matching': snapshot['total_matching'],
                    'observations_truncated': snapshot['observations_truncated'],
                    'demo_excluded': snapshot['demo_excluded'],
                    'captures_included': len(captures),
                    'captures_matching': snapshot['captures_matching'],
                    'captures_truncated': snapshot['captures_truncated'],
                    'observations_with_survey_coordinates': snapshot['positioned_count'],
                    'source_counts_included': sources, 'kind_counts_included': kinds,
                    'measurement_groups_included': len(series),
                    'measurement_groups_omitted': omitted_series},
        'measurements': series,
        'survey_captures': captures,
        'observations': observations,
        'limitations': [
            'The session receiver selection and field notes describe a user plan, not validated connected hardware, a scan result, or receiver identification.',
            'HISTORICAL REPORT: observations and captures were previously saved; none is a live detection.',
            'Survey/browser coordinates identify the observer location, never the radio transmitter or a police vehicle.',
            'Measured RSSI in dBm and NetworkManager signal-quality percent are different metrics; neither establishes direction or distance.',
            'Device identity, clocks, freshness, source descriptions and calibration may be unverified. Check per-record evidence.',
            'Manually entered and imported observations are not automatically verified hardware measurements.',
            'Absence of a detected signal or mapped item does not prove an area was free of it.',
            'Report exports may contain private identifiers or notes; inspect before sharing.',
        ],
    }


def _plain(value) -> str:
    if value is None or value == '':
        return '—'
    if isinstance(value, bool):
        return 'Yes' if value else 'No'
    return str(value)


def _h(value) -> str:
    return escape(_plain(value), quote=True)


def _table(columns: list[tuple[str, str]], rows: list[dict], empty_message: str) -> str:
    head = '<thead><tr>' + ''.join('<th scope="col">' + escape(title) + '</th>' for _, title in columns) + '</tr></thead>'
    if not rows:
        return '<p class="empty">' + escape(empty_message) + '</p>'
    body = ''.join('<tr>' + ''.join('<td>' + _h(row.get(key)) + '</td>' for key, _ in columns) + '</tr>' for row in rows)
    return '<div class="scroll"><table>' + head + '<tbody>' + body + '</tbody></table></div>'


def _record_cards(columns: list[tuple[str, str]], rows: list[dict], empty_message: str) -> str:
    """Printed observation details must not be squeezed into a 16-column table."""
    if not rows:
        return '<p class="empty">' + escape(empty_message) + '</p>'
    blocks = []
    for item in rows:
        cells = ''.join('<div class="record-field"><span>' + escape(label) + '</span><strong>' + _h(item.get(key)) + '</strong></div>'
                        for key, label in columns if item.get(key) is not None and item.get(key) != '')
        blocks.append('<article class="record"><div class="record-grid">' + cells + '</div></article>')
    return ''.join(blocks)


def report_html(report: dict) -> bytes:
    """Complete stand-alone printable HTML, with untrusted data escaped and no external assets."""
    session = report['investigation']
    summary = report['summary']
    options = report['options']
    flags = []
    if summary['observations_truncated']:
        flags.append('Observation rows are capped; this report is not a complete record export.')
    if summary['captures_truncated']:
        flags.append('Capture rows are capped; this report is not a complete capture archive.')
    if summary['measurement_groups_omitted']:
        flags.append('More measurement groups exist than are displayed.')
    if summary['demo_excluded']:
        flags.append(f"{summary['demo_excluded']} DEMO record(s) excluded; the report does not include synthetic readings unless selected.")
    if not options['include_coordinates']:
        flags.append('Precise latitude/longitude omitted by default. Notes and identifiers may still contain sensitive information.')
    if options['include_demo']:
        flags.append('SYNTHETIC DEMO observations explicitly included. They are not real detections.')
    coords = ([('latitude', 'Survey latitude'), ('longitude', 'Survey longitude'),
               ('accuracy_m', 'Fix accuracy m')] if options['include_coordinates'] else [])
    measure_cols = [('kind','Kind'),('source','Origin'),('identifier','Identifier'),('source_device','Device'),
                    ('hardware_id','Hardware ID'),('frequency_mhz','MHz'),('unit','Unit'),('count','Readings'),
                    ('minimum','Min'),('median','Median'),('maximum','Max'),('first_observed_at','First UTC'),
                    ('last_observed_at','Last UTC')]
    capture_cols = [('id','ID'),('sensor_id','Sensor'),('interface','Interface'),('retrieved_at_utc','Retrieved UTC'),
                    ('result_count','Returned'),('saved_count','Saved'),('freshness','Freshness'),
                    ('timestamp_basis','Time basis'),('hardware_id','Hardware ID'),('location_source','Location origin')] + coords
    observation_cols = [('id','ID'),('observed_at','Saved observation UTC'),('kind','Kind'),('source','Origin'),
                        ('label','Label'),('identifier','Identifier'),('source_device','Source device'),
                        ('frequency_mhz','MHz'),('rssi_dbm','RSSI dBm'),
                        ('signal_quality_percent','NM quality %'),('location_source','Location origin')] + coords + [
                        ('timestamp_basis','Time basis'),('hardware_id','Hardware ID'),('device_reported_at_utc','Device time'),
                        ('survey_capture_id','Capture ID'),('notes','Notes')]
    summary_items = [
        ('Included observations', summary['observations_included']),
        ('Matching observations', summary['observations_matching']),
        ('Saved captures', summary['captures_included']),
        ('Capture records total', summary['captures_matching']),
        ('With survey position', summary['observations_with_survey_coordinates']),
        ('Synthetic DEMO omitted', summary['demo_excluded']),
    ]
    stat_html = ''.join(f'<div class="stat"><strong>{_h(value)}</strong><span>{escape(label)}</span></div>' for label, value in summary_items)
    source_text = ', '.join(f'{escape(k)}: {v}' for k,v in summary['source_counts_included'].items()) or 'None'
    kind_text = ', '.join(f'{escape(k)}: {v}' for k,v in summary['kind_counts_included'].items()) or 'None'
    caution_html = ''.join('<li>' + escape(note) + '</li>' for note in flags + report['limitations'])
    document = f'''<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>OpenRF Investigation #{_h(session['id'])} — {_h(session['name'])}</title>
<style>
:root{{font-family:system-ui,-apple-system,Segoe UI,sans-serif;color:#16242b;background:#f3f6f7}}
*{{box-sizing:border-box}}body{{max-width:1100px;margin:0 auto;padding:36px 22px;line-height:1.45}}
header{{border-bottom:3px solid #007d75;padding-bottom:15px}}h1{{font-size:26px;line-height:1.2;overflow-wrap:anywhere;margin:12px 0}}
h2{{font-size:18px;margin:28px 0 12px}}.eyebrow{{text-transform:uppercase;letter-spacing:.12em;font-size:12px;font-weight:700;color:#036d6a}}
.meta{{font-size:13px;color:#465e68}}.status{{display:inline-block;background:#fff1ce;padding:7px 12px;border-radius:5px;font-weight:700;color:#6f4700;font-size:12px}}
.grid{{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;margin:18px 0}}.stat{{padding:13px;background:white;border:1px solid #d6e2e6;border-radius:6px}}
.stat strong,.stat span{{display:block}}.stat strong{{font-size:23px}}.stat span{{font-size:11px;color:#52707c}}.note{{background:#fff;border-left:3px solid #007d75;padding:12px}}
.scroll{{overflow-x:auto}}table{{width:100%;border-collapse:collapse;font-size:11px;table-layout:auto}}th,td{{text-align:left;vertical-align:top;border-bottom:1px solid #d8e1e5;padding:7px 6px;overflow-wrap:anywhere}}
th{{background:#e8f3f2;white-space:nowrap}}tr{{break-inside:avoid}}.empty{{color:#546e79;font-style:italic}}
.record{{border:1px solid #d8e1e5;border-radius:7px;padding:11px 13px;margin:10px 0;background:white;break-inside:avoid}}
.record-grid{{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px 15px}}
.record-field{{min-width:0;overflow-wrap:anywhere;font-size:11px}}
.record-field span{{display:block;color:#526d79;font-size:10px}}.record-field strong{{font-weight:500}}

li{{margin-bottom:5px}}footer{{border-top:1px solid #ccd7da;margin-top:30px;padding-top:9px;font-size:11px;color:#536b75}}
@media(max-width:650px){{.grid{{grid-template-columns:repeat(2,minmax(0,1fr))}}.record-grid{{grid-template-columns:repeat(2,minmax(0,1fr))}}}}
@page{{size:auto;margin:14mm}}@media print{{body{{padding:0;background:#fff;max-width:none}}.stat{{break-inside:avoid}}h2{{break-after:avoid}}.scroll{{overflow:visible}}table{{font-size:9px}}th,td{{padding:4px 3px}}a{{color:inherit}}}}
</style></head><body><header><div class="eyebrow">OPENRF / Local investigation report · v{REPORT_VERSION}</div>
<h1>{_h(session['name'])}</h1><p class="status">HISTORICAL SAVED RECORDS · NOT LIVE</p>
<p class="meta">Session #{_h(session['id'])} · {_h(session['status'])} · Started {_h(session['started_at'])} · Ended {_h(session['ended_at'])}<br>
Report generated {_h(report['generated_at_utc'])} · Source: local SQLite · No network uploads</p>
<p class="meta">Planned receiver: {_h(session.get('receiver_plan') or 'UNASSIGNED')} (plan only, not hardware evidence) · Site label: {_h(session.get('site_label'))}<br>
Survey objective: {_h(session.get('objective'))}<br>
Field notes: {_h(session.get('field_notes'))}</p></header>
<section><h2>Scope &amp; summary</h2><div class="grid">{stat_html}</div>
<p class="meta">Evidence sources (included): {source_text}<br>Observation kinds (included): {kind_text}</p>
<p class="note">This is a read-only historical export of a single investigation. The browser location, where recorded, is the observer's position—not a measured transmitter position.</p></section>
<section><h2>Measurement groups</h2><p class="meta">Grouped only when kind, evidence source, exact identifier, source device, hardware ID, MHz and unit match. Median/min/max are descriptive, not distance or direction estimates.</p>
{_table(measure_cols, report['measurements'], 'No compatible saved measurements with an identifier.')}</section>
<section><h2>Saved survey captures</h2><p class="meta">Explicit saved one-shot retrievals; zero-result captures remain listed. Device timestamps and freshness may be unverified.</p>
{_table(capture_cols, report['survey_captures'], 'No saved survey captures in this investigation.')}</section>
<section><h2>Observation record details</h2><p class="meta">Entries are ordered by stored observation timestamp and record ID. DEMO and coordinate inclusion depend on report options.</p>
{_record_cards(observation_cols, report['observations'], 'No saved observations match this report scope.')}</section>
<section><h2>Limitations &amp; privacy</h2><ul>{caution_html}</ul></section>
<footer>OpenRF · private device-generated historical report · Use your browser's Print command to print or Save as PDF. No source locations inferred.</footer>
</body></html>'''
    return document.encode('utf-8')
