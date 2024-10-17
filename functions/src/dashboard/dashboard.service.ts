import {admin, db} from "../index";

export const createDashboardService = async (body: {
    name: string;
    tagCategories: {
        name: string,
        tags: { name: string }[]
    }[];
    keywords: {
        name: string;
        data: Record<string, any>;
        tags: { name: string }[]
    }[]
}) => {
    try {
        const {
            name,
            tagCategories,
            keywords,
        } = body;

        // Start a new batch
        const batch = db.batch();

        // Create dashboard document
        const dashboardRef = db.collection("dashboards")
            .doc();
        batch.set(dashboardRef, {name});

        // Create tag categories and tags
        const tagCategoryRefs = [];
        for (const category of tagCategories) {
            const categoryRef = db.collection("tagCategories")
                .doc();
            batch.set(categoryRef, {name: category.name});
            tagCategoryRefs.push(categoryRef);

            for (const tag of category.tags) {
                const tagRef = db.collection("tags")
                    .doc();
                batch.set(tagRef, {name: tag.name});
                batch.update(categoryRef, {
                    tags: admin.firestore.FieldValue.arrayUnion(tagRef),
                });
            }
        }

        // Update dashboard with tag category references
        batch.update(dashboardRef, {
            tagCategories: tagCategoryRefs,
        });

        // Fetch keyword data from Google Ads API and save to database
        for (const keyword of keywords) {
            const keywordRef = db.collection("keywords")
                .doc();
            // const googleAdsData = await getKeywordDataFromGoogleAds(keyword.name);

            batch.set(keywordRef, {
                name: keyword.name,
                // Use Google Ads data if available, otherwise use provided data
                data: keyword.data,
                tags: keyword.tags
                    .map((tag: any) => db.collection("tags")
                        .doc(tag.id)),
                // Add this to associate keywords with the dashboard
                dashboardId: dashboardRef.id,
            });
        }

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
    res: any
) => {
    try {
        const dashboardRef = db.collection("dashboards")
            .doc(dashboardId);
        const dashboardDoc = await dashboardRef.get();

        if (!dashboardDoc.exists) {
            return res.status(404).send({error: "dashboard not found"});
        }

        const dashboardData = dashboardDoc.data();
        const tagCategoryRefs = dashboardData?.tagCategories || [];

        // Fetch tag categories and their tags
        const tagCategoriesPromises = tagCategoryRefs.map(async (ref: any) => {
            const categoryDoc = await ref.get();
            const categoryData = categoryDoc.data();
            const tagRefs = categoryData.tags || [];

            const tags = await Promise.all(tagRefs.map(async (tagRef: any) => {
                const tagDoc = await tagRef.get();
                return {id: tagDoc.id, ...tagDoc.data()};
            }));

            return {
                id: categoryDoc.id,
                name: categoryData.name,
                tags: tags,
            };
        });

        const tagCategories = await Promise.all(tagCategoriesPromises);

        // Fetch keywords associated with this dashboard
        const keywordsSnapshot = await db.collection("keywords")
            .where("dashboardId", "==", dashboardId)
            .get();

        const keywords = keywordsSnapshot.docs
            .map((doc) => ({
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
