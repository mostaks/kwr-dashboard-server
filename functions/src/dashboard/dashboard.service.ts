import {db} from '..';
import admin from 'firebase-admin';
import serviceAccount from '../permissions.json';
import {logger} from "firebase-functions";
import {chunkArray} from "../utils";

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

export const createDashboardService = async (body: {
  name: string;
  suffix: string;
  tagCategories: string[];
  keywords: Record<string, string>[];
}) => {
  logger.info('dashboard.service.createDashboardService');
  try {
    const {
      name,
      suffix,
      tagCategories,
      keywords
    } = body;
    // Start a new batch
    const batch = db.batch();

    logger.info('START dashboards')
    // Check if dashboard with the same name exists
    const dashboardQuery = await db.collection('dashboards')
      .where('name', '==', name)
      .get();

    const timestamp = admin.firestore.FieldValue.serverTimestamp();

    let dashboardRef;
    if (dashboardQuery.empty) {
      // Create new dashboard if it doesn't exist
      dashboardRef = db.collection('dashboards').doc();
      batch.set(
        dashboardRef,
        {
          name,
          suffix,
          lastUpdated: timestamp,
          createdAt: timestamp
        },
        {
          merge: true
        }
      );
    } else {
      // Use existing dashboard reference
      dashboardRef = dashboardQuery.docs[0].ref;
      batch.update(dashboardRef, {
        name,
        suffix,
        lastUpdated: admin.firestore
          .FieldValue
          .serverTimestamp()
      });
    }

    logger.info('COMPLETE dashboards');

    logger.info('START tagCategories')
    // Create/update tag categories and tags
    const tagCategoryRefs = [];
    for (const category of tagCategories) {
      // Check if tag category exists
      const categoryQuery = await db.collection('tagCategories')
        .where('name', '==', category)
        .get();

      let categoryRef;
      if (categoryQuery.empty) {
        // Create new tag category if it doesn't exist
        categoryRef = db.collection('tagCategories').doc();
        batch.set(categoryRef, {name: category}, {merge: true});
      } else {
        // Use existing tag category reference
        categoryRef = categoryQuery.docs[0].ref;
        batch.update(categoryRef, {name: category});
      }

      tagCategoryRefs.push(categoryRef);
    }

    // Update dashboard with tag category references
    batch.set(dashboardRef, {
      tagCategories: tagCategoryRefs
    }, {merge: true});

    logger.info('COMPLETE tagCategories')

    // Fetch keyword data from Google Ads API and save to database
    // Add this check before the try-catch block for the API call
    let shouldFetchNewData = true;

    if (!dashboardQuery.empty) {
      const lastUpdated = dashboardQuery.docs[0].data().lastUpdated?.toDate();
      if (lastUpdated) {
        const oneMonthAgo = new Date();
        oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);
        shouldFetchNewData = lastUpdated < oneMonthAgo;
      }
    }
    let searchVolumeResponse: SeacrhVolumeResponse | null = null;

    logger.info('START dataForSEO')
    if (shouldFetchNewData) {
      try {
        // Fetch data from DataForSEO
        const response =
          await fetch('https://api.dataforseo.com/v3/keywords_data/google_ads/search_volume/live', {
            method: 'POST',
            headers: {
              'Authorization': 'Basic '
                + Buffer
                  .from(
                    serviceAccount.dataforseo_login
                    + ':'
                    + serviceAccount.dataforseo_password
                  )
                  .toString('base64'),
              'Content-Type': 'application/json'
            },
            body: JSON.stringify([
              {
                "keywords": keywords.map(({Keyword}) => Keyword),
                "location_name": "Australia",
                "language_name": "English"
              }
            ])
          });

        searchVolumeResponse = await response
          .json();

      } catch (error) {
        console.error(`Error fetching DataForSEO data for dashboard ${name}:`, error);
        searchVolumeResponse = null;
      }
    } else {
      console.log(`Skipping DataForSEO API call for dashboard ${name} as data is less than 1 month old`);
    }

    const searchVolumeResult = searchVolumeResponse
      ?.tasks[0]
      ?.result;
    logger.info('COMPLETE dataForSEO')

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
    for (const chunk of keywordChunks) {
      const chunkSnapshot = await db.collection('keywords')
        .where('name', 'in', chunk)
        .get();

      allKeywordDocs = [...allKeywordDocs, ...chunkSnapshot.docs];
    }

    // Create a map of existing keywords
    const existingKeywords = new Map();
    allKeywordDocs.forEach(doc => {
      existingKeywords.set(doc.data().name, {ref: doc.ref, data: doc.data()});
    });

    // Batch fetch all existing tags
    const tagQueries = new Set();
    keywords.forEach(keyword => {
      Object.entries(keyword).forEach(([key, val]) => {
        if (tagCategories.includes(key)) {
          tagQueries.add(JSON.stringify({name: val, category: key}));
        }
      });
    });

    const existingTags = new Map();
    if (tagQueries.size > 0) {
      // Convert Set to Array and get tag names
      const tagNames = Array.from(tagQueries)
        .map(q => JSON.parse(q as any).name);

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
      const keywordData = {
        name: keyword.Keyword,
        dashboardRefs: [
          ...(existingKeyword?.data.dashboardRefs || [])
            .filter((existing: any) => existing.dashboardName !== name),
          {
            dashboardId: dashboardRef.id,
            dashboardName: name,
            keyRow: row
          }
        ],
        tags: keywordTagRefs,
      }

      // Add to batch
      batch.set(keywordRef, keywordData, {merge: true});

    }

    logger.info('COMPLETE keywords');


    // Update dashboard with keyword references
    batch.set(dashboardRef, {
      keywords: keywordRefs
    }, {merge: true});

    // Commit the batch
    await batch.commit();
    return dashboardRef;
  } catch (error: any) {
    const errorCode = error.code;
    const errorMessage = error.message;
    throw new Error(`${errorCode}: ${errorMessage}`);
  }
};

export const getDashboardByIdService = async (
  dashboardId: string,
  res: any,
) => {
  try {
    let dashboardDoc = await db.collection('dashboards').doc(dashboardId).get();


    // If not found, try by name
    if (!dashboardDoc.exists) {
      const nameQuery = await db.collection('dashboards')
        .where('name', '==', dashboardId)
        .get();

      if (nameQuery.empty) {
        return res.status(404).send({error: 'dashboard not found'});
      }
      dashboardDoc = nameQuery.docs[0];
    }

    const dashboardData = dashboardDoc.data();
    const tagCategoryRefs = dashboardData?.tagCategories || [];

    // Fetch tag categories and their tags
    const tagCategoriesPromises = tagCategoryRefs.map(async (ref: any) => {
      const categoryDoc = await ref.get();
      const categoryData = categoryDoc.data();
      const tagRefs = categoryData?.tags || [];

      const tags = await Promise.all(
        tagRefs.map(async (tagRef: any) => {
          const tagDoc = await tagRef.get();
          return {id: tagDoc.id, ...tagDoc.data()};
        }),
      );

      return {
        id: categoryDoc.id,
        name: categoryData.name,
        tags: tags,
      };
    });

    const tagCategories = await Promise.all(tagCategoriesPromises);

    // Fetch keywords associated with this dashboard
    const keywords = [];
    if (dashboardData?.keywords) {
      const keywordsSnapshot = await Promise.all(
        dashboardData.keywords.map((ref: any) => ref.get())
      );

      for (const doc of keywordsSnapshot) {
        const keywordData = doc.data();
        const tagRefs = keywordData?.tags || [];

        // Fetch all tags for this keyword
        const tags = await Promise.all(
          tagRefs.map(async (tagRef: any) => {
            const tagDoc = await tagRef.get();
            const tagData = tagDoc.data();

            if (tagData?.tagCategoryRef) {
              const tagCategoryDoc = await tagData.tagCategoryRef.get();
              return {
                id: tagDoc.id,
                ...tagData,
                tagCategoryRef: {
                  id: tagCategoryDoc.id,
                  ...tagCategoryDoc.data()
                }
              };
            }
            return {
              id: tagDoc.id,
              ...tagData
            };
          })
        );

        keywords.push({
          id: doc.id,
          ...keywordData,
          tags
        });
      }
    }

    return {
      id: dashboardDoc.id,
      name: dashboardData?.name,
      tagCategories: tagCategories,
      keywords: keywords,
    };
  } catch (error: any) {
    const errorCode = error.code;
    const errorMessage = error.message;
    throw new Error(`${errorCode}: ${errorMessage}`);
  }
};
