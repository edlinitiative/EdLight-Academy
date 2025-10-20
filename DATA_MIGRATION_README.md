# EdLight Academy Data Migration

## Overview
This document describes the transformation of comprehensive educational content into the EdLight Academy video database structure.

## Source Data
- **Original File**: `public_original/data/EdLight_All_Videos_FULL_DETAIL_ORIGINAL.csv`
- **Size**: 2,544 lines
- **Format**: Comprehensive lesson plans with full learning objectives, key concepts, activities, and quiz ideas
- **Content**: Detailed curriculum for Chemistry, Physics, Mathematics, and Economics across NS I-IV levels

## Transformation Process

### Script
- **Location**: `scripts/transform_video_data.py`
- **Purpose**: Parse multi-line CSV with UTF-8 BOM and extract structured video data
- **Features**:
  - Subject code mapping (Chemistry → CHEM, Physics → PHYS, etc.)
  - Unit number extraction from formatted titles
  - Learning objective extraction
  - Unique video ID generation (e.g., CHEM-NSI-U1-L1)
  - Placeholder YouTube URLs (to be replaced with real videos)

### Output Data
- **File**: `public_original/data/edlight_videos.csv`
- **Total Videos**: **309** lessons
- **Structure**: Compatible with React app's CSV parser

## Subjects & Distribution

| Subject | NS Level | Videos | Description |
|---------|----------|--------|-------------|
| Chemistry | NS I | ~50 | Introduction to Chemistry, Matter & Energy, Mixtures |
| Chemistry | NS II-IV | ~75 | Advanced topics, Organic Chemistry, Thermodynamics |
| Physics | NS II-IV | ~90 | Mechanics, Electricity, Waves, Modern Physics |
| Mathematics | NS I-III | ~70 | Algebra, Geometry, Trigonometry, Calculus |
| Economics | NS I | ~24 | Basic Economic Concepts, Supply & Demand |

## CSV Fields

```csv
id,subject_code,unit_no,unit_title,lesson_no,video_title,learning_objectives,language,duration_min,video_url,thumbnail_url,tags
```

### Field Descriptions

- **id**: Unique identifier (e.g., `CHEM-NSI-U1-L1`)
- **subject_code**: Composite code with NS level (e.g., `CHEM-NSI`)
- **unit_no**: Unit number within subject (1-18)
- **unit_title**: Clean English title (max 80 chars)
- **lesson_no**: Lesson sequence within unit (1-n)
- **video_title**: Full video title (max 120 chars, includes Creole)
- **learning_objectives**: Extracted from full content (max 200 chars)
- **language**: `English` (interface language)
- **duration_min**: Estimated 12-18 minutes based on content complexity
- **video_url**: Placeholder `https://www.youtube.com/embed/placeholder`
- **thumbnail_url**: Empty (to be populated)
- **tags**: Subject and unit-based tags

## Next Steps

### 1. YouTube Video Integration
Replace placeholder URLs with actual educational videos:
```python
# Update video_url field with real YouTube embed URLs
# Format: https://www.youtube.com/embed/VIDEO_ID
```

### 2. Thumbnail Generation
Add thumbnail URLs for each video (can use YouTube thumbnails or custom images)

### 3. Content Enhancement
- Add difficulty level (beginner, intermediate, advanced)
- Add prerequisite video IDs
- Add related quiz IDs from `edlight_quizzes.csv`

### 4. Localization
Current data includes Creole translations in titles. Consider:
- Extracting Creole titles to separate field
- Supporting multi-language UI switching
- Adding French translations

## Data Quality

### Strengths
✅ Comprehensive curriculum coverage
✅ Aligned with MENFP Haiti standards  
✅ Includes learning objectives
✅ Multiple NS levels supported
✅ Proper unit/lesson organization

### Areas for Improvement
⚠️ YouTube URLs are placeholders
⚠️ Thumbnails not yet populated
⚠️ Duration estimates (need actual video lengths)
⚠️ Missing quiz linkage

## Usage

### Running the Transformation
```bash
python3 scripts/transform_video_data.py
```

### Testing with React App
```bash
cd /workspaces/EdLight-Academy
npm run dev
# Visit http://localhost:3000/courses
```

The app's `parseCSV` function in `public/app.js` will automatically load and render the videos.

## File Locations

```
EdLight-Academy/
├── public_original/data/
│   ├── edlight_videos.csv                         # Output (309 videos)
│   ├── EdLight_All_Videos_FULL_DETAIL_ORIGINAL.csv # Source (2,544 lines)
│   ├── edlight_subjects.csv                        # Subject metadata
│   └── edlight_quizzes.csv                         # Quiz data
├── scripts/
│   └── transform_video_data.py                     # Transformation script
└── DATA_MIGRATION_README.md                        # This file
```

## License & Attribution

This educational content is based on the Haiti Ministry of Education (MENFP) national curriculum standards for secondary education (Nouveau Secondaire).

---
*Generated: October 2025*
*EdLight Initiative - Education for Haiti*
