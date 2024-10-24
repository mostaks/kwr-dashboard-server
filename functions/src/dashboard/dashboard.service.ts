import {db} from '..';
import admin from 'firebase-admin';
import serviceAccount from '../permissions.json';

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
        const tagRefs = [];

        for (const keyword of keywords) {
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

            // Fetch data from DataForSEO
            try {
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
                                "keyword": keyword.Keyword,
                                "location_name": "Australia",
                                "language_name": "English"
                            }
                        ])
                    });

                const dataForSEOResult = await response.json();

                const keywordTagRefs = [];

                for (const [key, val] of Object.entries(keyword)) {
                    if (tagCategories.includes(key)) {
                        // Create a new tag

                        // Query for existing tag
                        const tagQuery = await db.collection('tags')
                            .where('name', '==', val)
                            .get();

                        let tagRef;

                        if (tagQuery.empty) {
                            // Create new tag if it doesn't exist
                            tagRef = db.collection('tags').doc();
                        } else {
                            // Use existing tag reference if it exists
                            tagRef = tagQuery.docs[0].ref;
                        }

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
                        tagRefs.push(tagRef);
                        keywordTagRefs.push(tagRef);
                    }
                }

                // Use set with merge option to update existing or create new
                batch.set(keywordRef, {
                    name: keyword.Keyword,
                    tags: keywordTagRefs,
                    dataForSEO: dataForSEOResult, // Add the DataForSEO data
                    lastUpdated: admin.firestore.FieldValue.serverTimestamp() // Add timestamp for tracking
                }, {merge: true});

            } catch (error) {
                console.error(`Error fetching DataForSEO data for keyword ${keyword.Keyword}:`, error);
                // Continue with the loop even if DataForSEO fetch fails
                batch.set(keywordRef, {
                    name: keyword.Keyword,
                    tags: tagRefs,
                    dataForSEOError: 'Failed to fetch data',
                    lastUpdated: admin.firestore.FieldValue.serverTimestamp()
                }, {merge: true});
            }
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
