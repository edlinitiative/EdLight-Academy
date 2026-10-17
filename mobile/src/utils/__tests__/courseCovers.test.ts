import { COURSE_COVER_FRAMES, courseCover, courseCoverFor } from '../courseCovers';
import { courseVideoThumbs, courseVideoThumb, youTubeEmbedUrl, lessonVideoThumbs } from '../videoThumb';

const mathNs1 = {
  id: 'math-ns1',
  modules: [{ lessons: [{ type: 'video', videoUrl: 'https://www.youtube-nocookie.com/embed/AAAAAAAAAAA' }] }],
};

describe('courseCovers (ported from the web)', () => {
  it('maps the 9 hand-picked courses to an i.ytimg frame', () => {
    expect(Object.keys(COURSE_COVER_FRAMES)).toHaveLength(9);
    expect(courseCover('math-ns1')).toBe('https://i.ytimg.com/vi/eLmxna326QM/sddefault.jpg');
    expect(courseCover('math-ns4')).toBe('https://i.ytimg.com/vi/JH_sSDwehqo/sd3.jpg');
  });

  it('is null for an unknown or missing course', () => {
    expect(courseCover('bio-ns1')).toBeNull();
    expect(courseCover(undefined)).toBeNull();
  });

  it('falls back from id to the course code', () => {
    expect(courseCoverFor({ id: 'xyz', code: 'ECON-NS1' })).toBe('https://i.ytimg.com/vi/s8V74XR5BcY/sd2.jpg');
  });

  it('leads the thumbnail candidates, ahead of the first lesson still', () => {
    const list = courseVideoThumbs(mathNs1);
    expect(list[0]).toBe(courseCover('math-ns1'));
    expect(list.slice(1)).toEqual([
      'https://i.ytimg.com/vi/AAAAAAAAAAA/hq720.jpg',
      'https://i.ytimg.com/vi/AAAAAAAAAAA/mqdefault.jpg',
    ]);
    expect(courseVideoThumb(mathNs1)).toBe(courseCover('math-ns1'));
  });

  it('a course without a chosen cover keeps its lesson stills', () => {
    const c = { ...mathNs1, id: 'phys-ns2' };
    expect(courseVideoThumbs(c)[0]).toBe('https://i.ytimg.com/vi/AAAAAAAAAAA/hq720.jpg');
  });
});

describe('lesson player URLs', () => {
  it('always embeds from youtube-nocookie with the quiet params', () => {
    expect(youTubeEmbedUrl('abc')).toBe('https://www.youtube-nocookie.com/embed/abc?playsinline=1&rel=0&modestbranding=1');
    expect(youTubeEmbedUrl('abc', { autoplay: true })).toContain('&autoplay=1');
  });

  it('derives a lesson facade still, with the hand-entered thumbnail last', () => {
    expect(lessonVideoThumbs('https://youtu.be/xyz', 'https://x/t.jpg')).toEqual([
      'https://i.ytimg.com/vi/xyz/hq720.jpg',
      'https://i.ytimg.com/vi/xyz/mqdefault.jpg',
      'https://x/t.jpg',
    ]);
    expect(lessonVideoThumbs(null, null)).toEqual([]);
  });
});
