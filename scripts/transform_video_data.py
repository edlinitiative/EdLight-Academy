#!/usr/bin/env python3
"""
Transform EdLight comprehensive video data CSV into simplified format
for the React app's edlight_videos.csv structure.
"""

import csv
import re
from collections import defaultdict

# Read the comprehensive data
input_file = '/workspaces/EdLight-Academy/src/pages/EdLight_All_Videos_FULL_DETAIL.csv'
output_file = '/workspaces/EdLight-Academy/public_original/data/edlight_videos.csv'

# Subject code mapping
SUBJECT_CODES = {
    'Chemistry': 'CHEM',
    'Physics': 'PHYS',
    'Mathematics': 'MATH',
    'Math': 'MATH',
    'Economics': 'ECON',
    'Economy': 'ECON'
}

# NS Level mapping
NS_LEVELS = {
    'NSI': 'NS I',
    'NSII': 'NS II',
    'NSIII': 'NS III',
    'NS I': 'NSI',
    'NS II': 'NSII',
    'NS III': 'NSIII'
}

videos = []
video_counter = defaultdict(int)

print(f"Reading from: {input_file}")

try:
    with open(input_file, 'r', encoding='utf-8-sig') as f:
        reader = csv.DictReader(f)
        
        current_unit_no = defaultdict(int)
        
        for row in reader:
            subject = row.get('Subject', '').strip()
            ns_level = row.get('NS_Level', '').strip()
            unit_chapter = row.get('Unit_or_Chapter', '').strip()
            video_title = row.get('Video_or_Lesson_Title', '').strip()
            full_content = row.get('Full_Content', '').strip()
            
            if not subject or not video_title:
                continue
                
            # Get subject code
            subject_code = SUBJECT_CODES.get(subject, subject[:4].upper())
            
            # Create composite subject code with NS level
            composite_code = f"{subject_code}-{ns_level.upper()}" if ns_level else subject_code
            
            # Extract unit number from unit_chapter string
            unit_match = re.search(r'Unit\s*(\d+)', unit_chapter, re.IGNORECASE)
            if unit_match:
                unit_no = int(unit_match.group(1))
            else:
                # Increment unit counter for this subject
                current_unit_no[composite_code] += 1
                unit_no = current_unit_no[composite_code]
            
            # Extract unit title (remove "Unit X:" part)
            unit_title = re.sub(r'^Unit\s*\d+\s*:\s*', '', unit_chapter, flags=re.IGNORECASE).strip()
            # Also remove anything in parentheses (Creole translations)
            unit_title = re.sub(r'\s*\([^)]+\)', '', unit_title).strip()
            
            # Video counter for this unit
            video_counter[(composite_code, unit_no)] += 1
            lesson_no = video_counter[(composite_code, unit_no)]
            
            # Create unique video ID
            video_id = f"{composite_code}-U{unit_no}-L{lesson_no}"
            
            # Extract learning objectives from full_content
            learning_objectives = ""
            if full_content:
                obj_match = re.search(r'Learning Objectives:\s*([^\.]+\.)', full_content, re.IGNORECASE | re.DOTALL)
                if obj_match:
                    learning_objectives = obj_match.group(1).strip()
                    # Clean up - take first sentence only
                    learning_objectives = learning_objectives.split('.')[0] + '.'
            
            # Placeholder YouTube URL (you'll need to add real ones later)
            video_url = "https://www.youtube.com/embed/placeholder"
            
            # Create tags from subject and unit
            tags = f"{subject.lower()};{unit_title.lower().replace(' ', '-')}"
            
            # Duration estimate based on content complexity
            duration_min = 12 if len(full_content) < 1000 else (15 if len(full_content) < 2000 else 18)
            
            videos.append({
                'id': video_id,
                'subject_code': composite_code,
                'unit_no': unit_no,
                'unit_title': unit_title[:80],  # Limit length
                'lesson_no': lesson_no,
                'video_title': video_title[:120],  # Limit length
                'learning_objectives': learning_objectives[:200] if learning_objectives else 'Master key concepts',
                'language': 'English',
                'duration_min': duration_min,
                'video_url': video_url,
                'thumbnail_url': '',
                'tags': tags[:100]
            })

    print(f"\nProcessed {len(videos)} videos")
    print(f"Subjects found: {set([v['subject_code'] for v in videos])}")
    
    # Write output
    with open(output_file, 'w', encoding='utf-8', newline='') as f:
        fieldnames = ['id', 'subject_code', 'unit_no', 'unit_title', 'lesson_no', 
                     'video_title', 'learning_objectives', 'language', 'duration_min',
                     'video_url', 'thumbnail_url', 'tags']
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(videos)
    
    print(f"\n✓ Successfully created {output_file}")
    print(f"  Total videos: {len(videos)}")
    
    # Show sample
    if videos:
        print(f"\n Sample entries:")
        for v in videos[:3]:
            print(f"  • {v['id']}: {v['video_title']}")
    
except Exception as e:
    print(f"✗ Error: {e}")
    import traceback
    traceback.print_exc()
