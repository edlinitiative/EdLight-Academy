#!/usr/bin/env python3
import pandas as pd
import json
import re

# Load the CSV
df = pd.read_csv('public/data/edlight_videos.csv')

# Define a function to categorize exams
def get_level(title):
    if '9e' in title or '9AF' in title:
        return '9e Année'
    elif 'Terminale' in title or 'Philo' in title or 'NS' in title or 'SVT' in title:
        return 'Terminale'
    else:
        return 'Université'

# Create the catalog
catalog = {
    '9e Année': [],
    'Terminale': [],
    'Université': []
}

for _, row in df.iterrows():
    level = get_level(row['video_title'])
    # Simple regex to extract year, e.g., "2018" from "Examen de 9e Année (2018)"
    year_match = re.search(r'\((\d{4})\)', row['video_title'])
    year = year_match.group(1) if year_match else 'N/A'

    # Extract subject from title, assuming it's the first part before the year
    subject_match = re.search(r'^(.*?)(?:\s\(\d{4}\))', row['video_title'])
    subject = subject_match.group(1).strip() if subject_match else row['video_title']

    catalog[level].append({
        'id': row['id'],
        'title': row['video_title'],
        'subject': subject,
        'year': year,
        'video_url': row['video_url']
    })

# Save the JSON
with open('public/exam_catalog.json', 'w', encoding='utf-8') as f:
    json.dump(catalog, f, ensure_ascii=False, indent=2)

print("public/exam_catalog.json has been created successfully.")
