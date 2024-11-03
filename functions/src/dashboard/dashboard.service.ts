import {db} from '..';
import admin from 'firebase-admin';
import serviceAccount from '../permissions.json';
import {logger} from "firebase-functions";

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

export const  createDashboardService = async (body: {
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

    // Create an array to store keyword references
    const keywordRefs = [];
    const tagRefs: any[] = [];
    const dashboardTagTitleAndNames = [];

    logger.info('START keywords');
    for (const keyword of keywords) {
      // Query for existing keyword
      const keywordQuery = await db.collection('keywords')
        .where('name', '==', keyword.Keyword)
        .get();

      // Result from dataForSEO
      let searchVolume: KeywordResult | null = null;
      if (!keywordQuery.empty) {
        const existingKeyword = keywordQuery.docs[0].data();

        if (!shouldFetchNewData) {
          searchVolume = existingKeyword.searchVolume;
        } else {
          searchVolume = searchVolumeResult?.find((res) => res.keyword === keyword.Keyword) || null;
        }
      }

      let keywordRef;

      if (keywordQuery.empty) {
        // Create new keyword if it doesn't exist
        keywordRef = db.collection('keywords').doc();
      } else {
        // Use existing keyword reference if it exists
        keywordRef = keywordQuery.docs[0].ref;
      }

      keywordRefs.push(keywordRef);

      const keywordTagRefs = [];

      for (const [key, val] of Object.entries(keyword)) {
        if (tagCategories.includes(key)) {
          // Create a new tag
          dashboardTagTitleAndNames.push(key + val);

          // Query for existing tag
          const tagQuery = await db.collection('tags')
            .where('name', '==', val)
            .where('tagCategory', '==', key)
            .get();

          let tagRef;

          const newTag = tagRefs.find(async (t) => {
            const tg = await t.get()

            // @ts-ignore
            return tg.data.name === val && tg.data.tagCategory === key
          });

          if (!tagQuery.empty) {
            // Use existing tag reference if it exists
            tagRef = tagQuery.docs[0].ref;
          } else {
            // Create new tag if it doesn't exist
            tagRef = db.collection('tags').doc();
            // Find the corresponding tag category
            const categoryRef = tagCategoryRefs
              .find(async ref => {
                const thing = await ref.get();

                return thing.data.name === key;
              });

            batch.set(tagRef, {
              name: val,
              tagCategoryRef: categoryRef,
              tagCategory: key,
            }, {merge: true});
          }

          if (!newTag) {
            tagRefs.push(tagRef);
          }

          keywordTagRefs.push(tagRef);
        }
      }

      if (!keywordQuery.empty) {
        // Get existing keyword data
        const existingKeyword = keywordQuery.docs[0].data();
        const existingDashboardRefs = existingKeyword.dashboardRefs || [];
        const row = keyword;
        // Add monthly search data to row
        if (searchVolume) {
          searchVolume.monthly_searches?.forEach((searchData) => {
            const monthStr = Months[searchData.month - 1]; // Convert month number (1-12) to three letter format
            const yearStr = searchData.year.toString().slice(-2); // Get last two digits of year
            const key = `${monthStr}-${yearStr}`;
            row[key] = searchData.search_volume.toString();
          });
        }


        batch.set(keywordRef, {
          name: keyword.Keyword,
          dashboardRefs: [
            ...existingDashboardRefs.filter((existing: any) => existing.dashboardName !== name),
            {
              dashboardId: dashboardRef.id,
              dashboardName: name,
              keyRow: {...row}
            }
          ],
          tags: keywordTagRefs,
          ...(searchVolume ? {searchVolume} : {}),
          lastUpdated: admin.firestore.FieldValue.serverTimestamp()
        }, {merge: true});
      } else {
        const row = keyword;
        // Add monthly search data to row
        if (searchVolume) {
          searchVolume.monthly_searches?.forEach((searchData) => {
            const monthStr = Months[searchData.month - 1]; // Convert month number (1-12) to three letter format
            const yearStr = searchData.year.toString().slice(-2); // Get last two digits of year
            const key = `${monthStr}-${yearStr}`;
            row[key] = searchData.search_volume.toString();
          });
        }

        // Use set with merge option to update existing or create new
        batch.set(keywordRef, {
          name: keyword.Keyword,
          dashboardRefs: [{
            dashboardId: dashboardRef.id,
            dashboardName: name,
            keyRow: {...row}
          }],
          tags: keywordTagRefs,
          ...(searchVolume ? {searchVolume} : {}), // Only include searchVolume if it exists
          lastUpdated: admin.firestore.FieldValue.serverTimestamp() // Add timestamp for tracking
        }, {merge: true});
      }
    }

    // Update the dashboard with the list of keyword references
    batch.update(dashboardRef, {
      keywords: keywordRefs,
    });

    logger.info('COMPLETE keywords');

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
    let dashboardRef = db.collection('dashboards')
      .where('name', '==', dashboardId);
    let dashboardDoc = await dashboardRef.get();

    // Check by name or id
    if (dashboardDoc.empty) {
      dashboardRef = db.collection('dashboards')
        .where('id', '==', dashboardId);
      dashboardDoc = await dashboardRef.get();
    }

    if (dashboardDoc.empty) {
      return res.status(404).send({error: 'dashboard not found'});
    }

    const dashboardData = dashboardDoc.docs[0].data();
    const tagCategoryRefs = dashboardData?.tagCategories || [];

    // Fetch tag categories and their tags
    const tagCategoriesPromises = tagCategoryRefs.map(async (ref: any) => {
      const categoryDoc = await ref.get();
      const categoryData = categoryDoc.data();
      const tagRefs = categoryData.tags || [];

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
    const keywordsSnapshot = await Promise.all(
      dashboardData.keywords.map((ref: any) => ref.get())
    );

    const keywords = await Promise.all(
      keywordsSnapshot.map(async (doc) => {
        const keywordData = doc.data();
        const tagRefs = keywordData.tags || [];

        // Fetch all tags for this keyword
        const tags = await Promise.all(
          tagRefs.map(async (tagRef: any) => {
            const tagDoc = await tagRef.get();
            const tagData = tagDoc.data();

            // Get the tag category for each tag
            const tagCategoryDoc = await tagData.tagCategoryRef.get();

            return {
              id: tagDoc.id,
              ...tagData,
              tagCategoryRef: {
                id: tagCategoryDoc.id,
                ...tagCategoryDoc.data()
              }
            };
          })
        );

        return {
          id: doc.id,
          ...keywordData,
          tags
        }

      }));

    return {
      id: dashboardData.id,
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
