import admin, {firestore} from "firebase-admin";
import {logger} from "firebase-functions";
import serviceAccount from "../permissions.json";
import {chunkArray} from "../utils";
import QuerySnapshot = firestore.QuerySnapshot;
import firebase from "firebase/compat";
import DocumentData = firebase.firestore.DocumentData;

type MonthlySearch = {
  year: number;
  month: number;
  search_volume: number;
}

enum Months {
  Jan = 0,
  Feb = 1,
  Mar = 2,
  Apr = 3,
  May = 4,
  Jun = 5,
  Jul = 6,
  Aug = 7,
  Sep = 8,
  Oct = 9,
  Nov = 10,
  Dec = 11
}

type KeywordResult = {
  keyword: string;
  spell: null;
  location_code: number;
  language_code: string;
  search_partners: boolean;
  competition: 'HIGH' | null;
  competition_index: number | null;
  search_volume: number | null;
  low_top_of_page_bid: number | null;
  high_top_of_page_bid: number | null;
  cpc: number | null;
  monthly_searches: MonthlySearch[] | null;
}

type TaskData = {
  api: string;
  function: string;
  se: string;
  keywords: string[];
  location_name: string;
  language_name: string;
}

type Task = {
  id: string;
  status_code: number;
  status_message: string;
  time: string;
  cost: number;
  result_count: number;
  path: string[];
  data: TaskData;
  result: KeywordResult[];
}

type SeacrhVolumeResponse = {
  version: string;
  status_code: number;
  status_message: string;
  time: string;
  cost: number;
  tasks_count: number;
  tasks_error: number;
  tasks: Task[];
}

export interface ICreateDashboardArgs {
  name: string;
  suffix: string;
  tagCategories: string[];
  keywords: Record<string, string>[];
  location_name: string; // Add this parameter
  logo: string;
  password: string;
  visibleTagCategories: string[];
}

export const createOrUpdateDashboard = async (
  batch: admin.firestore.WriteBatch,
  db: admin.firestore.Firestore,
  body: ICreateDashboardArgs,
): Promise<{ dashboardRef: admin.firestore.DocumentReference, dashboardQuery: QuerySnapshot<DocumentData, DocumentData> }> => {
  logger.info('START dashboards');

  const {name, suffix, logo, password, visibleTagCategories} = body;

  const dashboardQuery = await db.collection('dashboards')
    .where('name', '==', name)
    .get();

  const timestamp = admin.firestore.FieldValue.serverTimestamp();
  let dashboardRef: admin.firestore.DocumentReference;

  if (dashboardQuery.empty) {
    dashboardRef = db.collection('dashboards').doc();
    batch.set(
      dashboardRef,
      {
        name,
        suffix,
        logo,
        password,
        visibleTagCategories,
        lastUpdated: timestamp,
        createdAt: timestamp,
      },
      {merge: true}
    );
  } else {
    dashboardRef = dashboardQuery.docs[0].ref;
    batch.update(dashboardRef, {
      name,
      suffix,
      logo,
      password,
      visibleTagCategories,
      lastUpdated: timestamp,
    });
  }

  logger.info('COMPLETE dashboards');
  return {dashboardRef, dashboardQuery}
};

export const createOrUpdateTagCategories = async (
  tagCategories: string[],
  dashboardRef: admin.firestore.DocumentReference,
  batch: admin.firestore.WriteBatch,
  db: admin.firestore.Firestore
): Promise<admin.firestore.DocumentReference[]> => {
  logger.info('START tagCategories');

  const tagCategoryRefs: admin.firestore.DocumentReference[] = [];

  for (const category of tagCategories) {
    const categoryQuery = await db.collection('tagCategories')
      .where('name', '==', category)
      .get();

    let categoryRef: admin.firestore.DocumentReference;
    if (categoryQuery.empty) {
      categoryRef = db.collection('tagCategories').doc();
      batch.set(categoryRef, {name: category}, {merge: true});
    } else {
      categoryRef = categoryQuery.docs[0].ref;
      batch.update(categoryRef, {name: category});
    }

    tagCategoryRefs.push(categoryRef);
  }

  // Update dashboard with tag category references
  batch.set(dashboardRef, {
    tagCategories: tagCategoryRefs
  }, {merge: true});

  logger.info('COMPLETE tagCategories');

  return tagCategoryRefs;
};

export const fetchDataForSEO = async (
  keywords: Record<string, string>[],
  location_name: string,
  dashboardQuery: admin.firestore.QuerySnapshot,
  name: string,
  shouldFetchNewData: boolean
): Promise<KeywordResult[] | null> => {
  logger.info('START dataForSEO');

  let searchVolumeResponse: SeacrhVolumeResponse | null = null;

  if (shouldFetchNewData) {
    try {
      const response = await fetch('https://api.dataforseo.com/v3/keywords_data/google_ads/search_volume/live', {
        method: 'POST',
        headers: {
          'Authorization': 'Basic ' + Buffer.from(
            serviceAccount.dataforseo_login + ':' + serviceAccount.dataforseo_password
          ).toString('base64'),
          'Content-Type': 'application/json'
        },
        body: JSON.stringify([
          {
            "keywords": keywords.map(({Keyword}: any) => Keyword),
            "location_name": location_name || 'Australia',
            "language_name": "English"
          }
        ])
      });

      searchVolumeResponse = await response.json();
    } catch (error) {
      console.error(`Error fetching DataForSEO data for dashboard ${name}:`, error);
      searchVolumeResponse = null;
    }
  } else {
    console.log(`Skipping DataForSEO API call for dashboard ${name} as data is less than 1 month old`);
  }

  logger.info('COMPLETE dataForSEO');
  return searchVolumeResponse?.tasks[0]?.result || null;
};

export const processKeywordsAndTags = async (
  keywords: Record<string, string>[],
  dashboardRef: admin.firestore.DocumentReference,
  dashboardName: string,
  tagCategories: string[],
  tagCategoryRefs: admin.firestore.DocumentReference[],
  searchVolumeResult: KeywordResult[] | null,
  shouldFetchNewData: boolean,
  batch: admin.firestore.WriteBatch,
  db: admin.firestore.Firestore
): Promise<{ keywordRefs: admin.firestore.DocumentReference[], dashboardTagTitleAndNames: string[] }> => {
  logger.info('START keywords');
  // Create an array to store keyword references
  const keywordRefs = [];
  const dashboardTagTitleAndNames = [];

  // Split keywords into chunks of 30
  const keywordNames = keywords.map(k => k.Keyword);
  const keywordChunks = chunkArray(keywordNames, 20);

  // Array to store all keyword docs
  let allKeywordDocs: any[] = [];

  // Process each chunk
  logger.info('Process each chunk');
  for (const chunk of keywordChunks) {
    const chunkSnapshot = await db.collection('keywords')
      .where('name', 'in', chunk)
      .get();

    allKeywordDocs = [...allKeywordDocs, ...chunkSnapshot.docs];
  }

  logger.info('Create a map of existing keywords');
  // Create a map of existing keywords
  const existingKeywords = new Map();
  allKeywordDocs.forEach(doc => {
    existingKeywords.set(doc.data()?.name, {ref: doc.ref, data: doc.data()});
  });

  logger.info('Batch fetch all existing tags');
  // Batch fetch all existing tags
  const tagQueries = new Set();
  keywords.forEach(keyword => {
    Object.entries(keyword).forEach(([key, val]) => {
      if (tagCategories.includes(key)) {
        tagQueries.add(JSON.stringify({name: val, category: key}));
      }
    });
  });

  logger.info('existingTags');
  const existingTags = new Map();
  if (tagQueries.size > 0) {
    // Convert Set to Array and get tag names
    const tagNames = Array.from(tagQueries)
      .map(q => JSON.parse(q as any)?.name);

    // Split into chunks of 30 (Firestore's limit)
    const tagChunks = chunkArray(tagNames, 30);

    // Process each chunk
    for (const chunk of tagChunks) {
      const chunkSnapshot = await db.collection('tags')
        .where('name', 'in', chunk)
        .get();

      // Add results to map
      chunkSnapshot.forEach(doc => {
        const data = doc.data();
        existingTags.set(`${data.tagCategory}-${data.name}`, {ref: doc.ref, data});
      });
    }
  }

  logger.info('Process keywords');
  // Process keywords
  for (const keyword of keywords) {
    const existingKeyword = existingKeywords.get(keyword.Keyword);

    // Handle search volume
    let searchVolume: KeywordResult | null = null;
    if (existingKeyword) {
      searchVolume = !shouldFetchNewData
        ? existingKeyword.data.searchVolume
        : searchVolumeResult?.find((res) => res.keyword === keyword.Keyword) || null;
    }

    // Create or get keyword reference
    const keywordRef = existingKeyword
      ? existingKeyword.ref
      : db.collection('keywords').doc();

    keywordRefs.push(keywordRef);

    const keywordTagRefs = [];

    // Process tags
    for (const [key, val] of Object.entries(keyword)) {
      if (tagCategories.includes(key)) {
        dashboardTagTitleAndNames.push(key + val);

        const tagKey = `${key}-${val}`;
        let tagRef = existingTags.get(tagKey)?.ref;

        if (!tagRef) {
          tagRef = db.collection('tags').doc();
          // Find the category ref by checking the category name in the snapshot data
          const categoryRef = tagCategoryRefs.find(async (ref) => {
            const snapshot = await ref.get();
            return snapshot.data()?.name === key;
          });

          if (!categoryRef) {
            logger.warn(`Category reference not found for ${key}`);
            continue; // Skip this tag if category ref not found
          }

          batch.set(tagRef, {
            name: val,
            tagCategoryRef: categoryRef,
            tagCategory: key,
          }, {merge: true});

          existingTags.set(tagKey, {ref: tagRef});
        }

        keywordTagRefs.push(tagRef);
      }
    }

    // Prepare row data with monthly searches
    logger.info('Prepare row data with monthly searches');
    const row = {...keyword};
    if (searchVolume?.monthly_searches) {
      searchVolume.monthly_searches.forEach((searchData) => {
        const monthStr = Months[searchData.month - 1];
        const yearStr = searchData.year.toString().slice(-2);
        const key = `${monthStr}-${yearStr}`;
        row[key] = searchData.search_volume.toString();
      });
    }

    // Set keyword data
    logger.info('Set keyword data');
    const keywordData = {
      name: keyword.Keyword,
      dashboardRefs: [
        ...(existingKeyword?.data.dashboardRefs || [])
          .filter((existing: any) => existing.dashboardName !== dashboardName),
        {
          dashboardId: dashboardRef.id,
          dashboardName,
          keyRow: row
        }
      ],
      tags: keywordTagRefs,
    }

    // Add to batch
    logger.info('Add to batch');
    batch.set(keywordRef, keywordData, {merge: true});

  }

  logger.info('COMPLETE keywords');
  return {keywordRefs, dashboardTagTitleAndNames};
};