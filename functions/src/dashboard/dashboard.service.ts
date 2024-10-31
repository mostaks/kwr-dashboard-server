import {db} from '..';
import admin from 'firebase-admin';
import serviceAccount from '../permissions.json';
import {logger} from "firebase-functions";

type MonthlySearch = {
    year: number;
    month: number;
    search_volume: number;
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

type DataForSEOResponse = {
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
    tagCategories: string[];
    keywords: Record<string, string>[];
}) => {
    try {
        const {
            name,
            tagCategories,
            keywords
        } = body;
        // Start a new batch
        const batch = db.batch();

        // Check if dashboard with the same name exists
        const dashboardQuery = await db.collection('dashboards')
            .where('name', '==', name)
            .get();

        let dashboardRef;
        if (dashboardQuery.empty) {
            // Create new dashboard if it doesn't exist
            dashboardRef = db.collection('dashboards').doc();
            batch.set(dashboardRef, {name});
        } else {
            // Use existing dashboard reference
            dashboardRef = dashboardQuery.docs[0].ref;
            batch.update(dashboardRef, {name});
        }

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
                batch.set(categoryRef, {name: category});
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

        // Fetch keyword data from Google Ads API and save to database
        // Create an array to store keyword references
        const keywordRefs = [];
        const tagRefs: any[] = [];
        const dashboardTagTitleAndNames = [];
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

            const dataForSEOResponse: DataForSEOResponse = await response
                .json();

            const dataForSeoResult = dataForSEOResponse
                .tasks[0]
                .result;

            for (const keyword of keywords) {
                // Result from dataForSEO
                const dataForSEO = dataForSeoResult.find((res) => res.keyword === keyword.Keyword);
                // Query for existing keyword
                const keywordQuery = await db.collection('keywords')
                    .where('name', '==', keyword.Keyword)
                    .get();

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

                        logger.info('BLAH BLAH')

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
                            });
                        }

                        if (!newTag) {
                            tagRefs.push(tagRef);
                        }

                        keywordTagRefs.push(tagRef);
                    }
                }

                // Use set with merge option to update existing or create new
                batch.set(keywordRef, {
                    name: keyword.Keyword,
                    tags: keywordTagRefs,
                    dataForSEO, // Add the DataForSEO data
                    lastUpdated: admin.firestore.FieldValue.serverTimestamp() // Add timestamp for tracking
                }, {merge: true});

            }
        } catch (error) {
            console.error(`Error fetching DataForSEO data for campaign ${name}:`, error);
        }

        // Update the dashboard with the list of keyword references
        batch.update(dashboardRef, {
            keywords: keywordRefs,
        });

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
        const dashboardRef = db.collection('dashboards').doc(dashboardId);
        const dashboardDoc = await dashboardRef.get();

        if (!dashboardDoc.exists) {
            return res.status(404).send({error: 'dashboard not found'});
        }

        const dashboardData = dashboardDoc.data();
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
        const keywordsSnapshot = await db
            .collection('keywords')
            .where('dashboardId', '==', dashboardId)
            .get();

        const keywords = keywordsSnapshot.docs.map((doc) => ({
            id: doc.id,
            ...doc.data(),
        }));

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
