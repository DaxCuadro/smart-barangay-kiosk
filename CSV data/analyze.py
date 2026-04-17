import csv, statistics, math
from collections import Counter

# ---- SURVEY DATA ----
rows = []
with open('CSV data/survey_responses_export_2026-04-16.csv', encoding='utf-8') as f:
    reader = csv.DictReader(f)
    for r in reader:
        rows.append(r)

# Separate by survey_type and source
resident_pre = [r for r in rows if r['survey_type']=='Pre-Usage' and r['source'] in ('Kiosk','Remote')]
resident_post = [r for r in rows if r['survey_type']=='Post-Usage' and r['source'] in ('Kiosk','Remote')]
admin_pre = [r for r in rows if r['survey_type']=='Pre-Usage' and r['source']=='Admin']
admin_post = [r for r in rows if r['survey_type']=='Post-Usage' and r['source']=='Admin']

print('=== SURVEY RESPONSE COUNTS ===')
print(f'Resident Pre-Usage: {len(resident_pre)}')
print(f'Resident Post-Usage: {len(resident_post)}')
print(f'Admin Pre-Usage: {len(admin_pre)}')
print(f'Admin Post-Usage: {len(admin_post)}')

for gn, g in [('Res Pre', resident_pre), ('Res Post', resident_post), ('Admin Pre', admin_pre), ('Admin Post', admin_post)]:
    brgy = Counter(r['barangay'] for r in g)
    print(f'  {gn}: {dict(brgy)}')

for gn, g in [('Res Pre', resident_pre), ('Res Post', resident_post)]:
    src = Counter(r['source'] for r in g)
    print(f'  {gn} by source: {dict(src)}')

print()

def compute_stats(group, prefix, num_items):
    results = {}
    for i in range(1, num_items+1):
        key = f'{prefix}_{i}'
        vals = [int(r[key]) for r in group if r.get(key) and r[key].strip()]
        if vals:
            mean = statistics.mean(vals)
            sd = statistics.stdev(vals) if len(vals)>1 else 0
            results[key] = {'n': len(vals), 'mean': round(mean,2), 'sd': round(sd,2)}
    return results

def part_means(stats, parts):
    for pn, keys in parts.items():
        means = [stats[k]['mean'] for k in keys if k in stats]
        overall = round(statistics.mean(means),2) if means else 0
        print(f'  {pn} overall mean: {overall}')

# ---- RESIDENT PRE ----
print('=== RESIDENT PRE-USAGE (15 items) ===')
pre_stats = compute_stats(resident_pre, 'pre', 15)
for k, v in pre_stats.items():
    print(f'  {k}: n={v["n"]}, M={v["mean"]}, SD={v["sd"]}')

parts_pre = {
    'Part 1: Current Experience': ['pre_1','pre_2','pre_3','pre_4','pre_5'],
    'Part 2: Accessibility': ['pre_6','pre_7','pre_8'],
    'Part 3: Tech Readiness': ['pre_9','pre_10','pre_11','pre_12'],
    'Part 4: Perceived Need': ['pre_13','pre_14','pre_15'],
}
part_means(pre_stats, parts_pre)
all_pre = [pre_stats[k]['mean'] for k in pre_stats]
print(f'  GRAND MEAN: {round(statistics.mean(all_pre),2)}')

# ---- RESIDENT POST ----
print()
print('=== RESIDENT POST-USAGE (23 items) ===')
post_stats = compute_stats(resident_post, 'post', 23)
for k, v in post_stats.items():
    print(f'  {k}: n={v["n"]}, M={v["mean"]}, SD={v["sd"]}')

parts_post = {
    'Part 1: Ease of Use': ['post_1','post_2','post_3','post_4','post_5'],
    'Part 2: Efficiency': ['post_6','post_7','post_8'],
    'Part 3: Accessibility': ['post_9','post_10','post_11','post_12'],
    'Part 4: Reliability': ['post_13','post_14','post_15'],
    'Part 5: SMS Notification': ['post_16','post_17','post_18'],
    'Part 6: Overall Satisfaction': ['post_19','post_20','post_21','post_22','post_23'],
}
part_means(post_stats, parts_post)
all_post = [post_stats[k]['mean'] for k in post_stats]
print(f'  GRAND MEAN: {round(statistics.mean(all_post),2)}')

# ---- ADMIN PRE ----
print()
print('=== ADMIN PRE-USAGE (14 items) ===')
admin_pre_stats = compute_stats(admin_pre, 'admin_pre', 14)
for k, v in admin_pre_stats.items():
    print(f'  {k}: n={v["n"]}, M={v["mean"]}, SD={v["sd"]}')
parts_admin_pre = {
    'Part 1: Current Workflow': ['admin_pre_1','admin_pre_2','admin_pre_3','admin_pre_4'],
    'Part 2: Challenges': ['admin_pre_5','admin_pre_6','admin_pre_7','admin_pre_8'],
    'Part 3: Tech Readiness': ['admin_pre_9','admin_pre_10','admin_pre_11','admin_pre_12'],
    'Part 4: Expectations': ['admin_pre_13','admin_pre_14'],
}
part_means(admin_pre_stats, parts_admin_pre)
adpre = [admin_pre_stats[k]['mean'] for k in admin_pre_stats]
print(f'  GRAND MEAN: {round(statistics.mean(adpre),2)}')

# ---- ADMIN POST ----
print()
print('=== ADMIN POST-USAGE (19 items) ===')
admin_post_stats = compute_stats(admin_post, 'admin_post', 19)
for k, v in admin_post_stats.items():
    print(f'  {k}: n={v["n"]}, M={v["mean"]}, SD={v["sd"]}')
parts_admin_post = {
    'Part 1: Ease of Use': ['admin_post_1','admin_post_2','admin_post_3','admin_post_4'],
    'Part 2: Efficiency': ['admin_post_5','admin_post_6','admin_post_7','admin_post_8'],
    'Part 3: Features': ['admin_post_9','admin_post_10','admin_post_11','admin_post_12'],
    'Part 4: Reliability': ['admin_post_13','admin_post_14','admin_post_15'],
    'Part 5: Overall Satisfaction': ['admin_post_16','admin_post_17','admin_post_18','admin_post_19'],
}
part_means(admin_post_stats, parts_admin_post)
adpost = [admin_post_stats[k]['mean'] for k in admin_post_stats]
print(f'  GRAND MEAN: {round(statistics.mean(adpost),2)}')

# ---- FEEDBACK DATA ----
print()
print('=== FEEDBACK DATA ===')
fb_rows = []
with open('CSV data/all_feedback_export.csv', encoding='utf-8') as f:
    for r in csv.DictReader(f):
        fb_rows.append(r)
print(f'Total feedback entries: {len(fb_rows)}')
ratings = [int(r['rating']) for r in fb_rows if r.get('rating')]
print(f'Ratings: n={len(ratings)}, M={round(statistics.mean(ratings),2)}, SD={round(statistics.stdev(ratings),2)}')
rc = Counter(ratings)
for k in sorted(rc.keys()):
    print(f'  Rating {k}: {rc[k]} ({round(rc[k]/len(ratings)*100,1)}%)')

by_brgy = {}
for r in fb_rows:
    b = r['barangay']
    if b not in by_brgy:
        by_brgy[b] = []
    by_brgy[b].append(int(r['rating']))
for b, vals in by_brgy.items():
    print(f'  {b}: n={len(vals)}, M={round(statistics.mean(vals),2)}')

by_src = Counter(r['source'] for r in fb_rows)
print(f'  By source: {dict(by_src)}')

# ---- RESIDENTS DATA ----
print()
print('=== RESIDENTS DATA ===')
res_rows = []
with open('CSV data/residents_export (1).csv', encoding='utf-8') as f:
    for r in csv.DictReader(f):
        res_rows.append(r)
print(f'Total residents: {len(res_rows)}')

MAANGAS_ID = 'd5f0122d-be85-4476-b11a-0da15c8d8429'
STAMARIA_ID = 'e316bc08-8bd3-401f-ab65-e2e0165974cf'

maangas = [r for r in res_rows if r['barangay_id']==MAANGAS_ID]
stamaria = [r for r in res_rows if r['barangay_id']==STAMARIA_ID]
print(f'  Maangas: {len(maangas)}')
print(f'  Santa Maria: {len(stamaria)}')

for name, grp in [('Maangas', maangas), ('Sta Maria', stamaria)]:
    sex = Counter(r['sex'] for r in grp)
    print(f'  {name} sex: {dict(sex)}')

# ---- RELEASES DATA ----
print()
print('=== RELEASES DATA ===')
rel_rows = []
with open('CSV data/releases_export.csv', encoding='utf-8') as f:
    for r in csv.DictReader(f):
        rel_rows.append(r)
print(f'Total releases: {len(rel_rows)}')
by_doc = Counter(r['document'] for r in rel_rows)
for d, c in by_doc.most_common():
    print(f'  {d}: {c}')
by_brgy_rel = Counter('Maangas' if r['barangay_id']==MAANGAS_ID else 'Santa Maria' for r in rel_rows)
print(f'  By barangay: {dict(by_brgy_rel)}')
