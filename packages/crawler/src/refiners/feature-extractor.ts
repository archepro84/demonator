import { db } from '../database/kysely';
import type { FeatureCandidate, FeatureDefinition } from '../schemas/refined.schema';

// Feature definitions - keyword to feature mapping
const FEATURE_DEFINITIONS: FeatureDefinition[] = [
  // Genre
  { name: 'genre_romance', category: 'genre', displayName: '로맨스', keywords: ['로맨스', '연애', '러브'] },
  { name: 'genre_fantasy', category: 'genre', displayName: '판타지', keywords: ['판타지', '마법', '던전'] },
  { name: 'genre_rofan', category: 'genre', displayName: '로맨스판타지', keywords: ['로판', '로맨스판타지', 'rofan'] },
  { name: 'genre_action', category: 'genre', displayName: '액션', keywords: ['액션', '전투', '배틀'] },
  { name: 'genre_martial', category: 'genre', displayName: '무협', keywords: ['무협', '무림', '강호'] },
  { name: 'genre_mystery', category: 'genre', displayName: '미스터리', keywords: ['미스터리', '추리', '스릴러'] },
  { name: 'genre_horror', category: 'genre', displayName: '호러', keywords: ['호러', '공포', '괴담'] },
  { name: 'genre_sf', category: 'genre', displayName: 'SF', keywords: ['sf', 'SF', '공상과학', '우주'] },
  { name: 'genre_bl', category: 'genre', displayName: 'BL', keywords: ['bl', 'BL', '보이즈러브'] },

  // Setting
  { name: 'setting_modern', category: 'setting', displayName: '현대', keywords: ['현대', '현대물'] },
  { name: 'setting_medieval', category: 'setting', displayName: '중세', keywords: ['중세', '서양풍'] },
  { name: 'setting_isekai', category: 'setting', displayName: '이세계', keywords: ['이세계', '차원이동', '빙의'] },
  { name: 'setting_academy', category: 'setting', displayName: '학원', keywords: ['학원', '아카데미', '학교'] },
  { name: 'setting_game', category: 'setting', displayName: '게임판타지', keywords: ['게임', '시스템', '레벨업'] },
  { name: 'setting_palace', category: 'setting', displayName: '궁중', keywords: ['궁중', '황궁', '왕궁'] },

  // Protagonist
  { name: 'protag_female', category: 'protagonist', displayName: '여주인공', keywords: ['여주', '여주인공'] },
  { name: 'protag_male', category: 'protagonist', displayName: '남주인공', keywords: ['남주', '남주인공'] },
  { name: 'protag_regressor', category: 'protagonist', displayName: '회귀', keywords: ['회귀', '리그레서'] },
  { name: 'protag_reincarnator', category: 'protagonist', displayName: '환생', keywords: ['환생', '전생'] },
  { name: 'protag_transmigrator', category: 'protagonist', displayName: '빙의', keywords: ['빙의', '빙의물'] },
  { name: 'protag_op', category: 'protagonist', displayName: '먼치킨', keywords: ['먼치킨', '사기캐', 'op'] },

  // Tone
  { name: 'tone_serious', category: 'tone', displayName: '진지', keywords: ['진지', '시리어스'] },
  { name: 'tone_comedy', category: 'tone', displayName: '코믹', keywords: ['코믹', '코미디', '개그'] },
  { name: 'tone_dark', category: 'tone', displayName: '다크', keywords: ['다크', '암울', '잔혹'] },
  { name: 'tone_fluff', category: 'tone', displayName: '달달', keywords: ['달달', '플러피', '힐링'] },
];

export class FeatureExtractor {
  private featureMap: Map<string, FeatureDefinition>;

  constructor() {
    this.featureMap = new Map();
    for (const def of FEATURE_DEFINITIONS) {
      this.featureMap.set(def.name, def);
    }
  }

  extractFromKeywords(keywords: string[]): FeatureCandidate[] {
    const candidates: FeatureCandidate[] = [];
    const foundFeatures = new Set<string>();

    for (const keyword of keywords) {
      const normalizedKeyword = keyword.toLowerCase().trim();

      for (const def of FEATURE_DEFINITIONS) {
        if (foundFeatures.has(def.name)) continue;

        for (const kw of def.keywords) {
          if (normalizedKeyword.includes(kw.toLowerCase())) {
            foundFeatures.add(def.name);
            candidates.push({
              featureName: def.name,
              source: 'keyword',
              confidence: 0.9,
            });
            break;
          }
        }
      }
    }

    return candidates;
  }

  extractFromDescription(description: string): FeatureCandidate[] {
    const candidates: FeatureCandidate[] = [];
    const foundFeatures = new Set<string>();
    const normalizedDesc = description.toLowerCase();

    for (const def of FEATURE_DEFINITIONS) {
      if (foundFeatures.has(def.name)) continue;

      let matchCount = 0;
      for (const kw of def.keywords) {
        if (normalizedDesc.includes(kw.toLowerCase())) {
          matchCount++;
        }
      }

      if (matchCount > 0) {
        foundFeatures.add(def.name);
        candidates.push({
          featureName: def.name,
          source: 'description',
          confidence: Math.min(0.5 + matchCount * 0.1, 0.8),
        });
      }
    }

    return candidates;
  }

  async extract(parseResultId: number): Promise<{
    runId: number;
    candidates: FeatureCandidate[];
  }> {
    // Get parse result
    const parseResult = await db
      .selectFrom('raw_work_parse_results')
      .selectAll()
      .where('id', '=', parseResultId)
      .executeTakeFirst();

    if (!parseResult) {
      throw new Error(`Parse result ${parseResultId} not found`);
    }

    // Create run
    const run = await db
      .insertInto('refined_work_feature_runs')
      .values({
        raw_parse_id: parseResultId,
        status: 'pending',
      })
      .returning('id')
      .executeTakeFirstOrThrow();

    // Extract features
    const allCandidates: FeatureCandidate[] = [];

    if (parseResult.keywords) {
      const keywordCandidates = this.extractFromKeywords(parseResult.keywords);
      allCandidates.push(...keywordCandidates);
    }

    if (parseResult.description) {
      const descCandidates = this.extractFromDescription(parseResult.description);
      // Only add if not already found from keywords
      for (const candidate of descCandidates) {
        if (!allCandidates.some((c) => c.featureName === candidate.featureName)) {
          allCandidates.push(candidate);
        }
      }
    }

    // Save candidates
    if (allCandidates.length > 0) {
      await db
        .insertInto('refined_work_feature_candidates')
        .values(
          allCandidates.map((c) => ({
            run_id: run.id,
            feature_name: c.featureName,
            source: c.source,
            confidence: c.confidence,
          }))
        )
        .execute();
    }

    // Update run status
    await db
      .updateTable('refined_work_feature_runs')
      .set({
        status: 'completed',
        finished_at: new Date(),
      })
      .where('id', '=', run.id)
      .execute();

    console.log(`Extracted ${allCandidates.length} features for parse result ${parseResultId}`);

    return { runId: run.id, candidates: allCandidates };
  }

  getFeatureDefinitions(): FeatureDefinition[] {
    return FEATURE_DEFINITIONS;
  }
}
