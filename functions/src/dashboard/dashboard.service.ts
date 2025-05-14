import { db } from "..";
import admin from "firebase-admin";
import { logger } from "firebase-functions/v2";
import {
  createOrUpdateDashboard,
  createOrUpdateTagCategories,
  fetchDataForSEO,
  ICreateDashboardArgs,
  monthlyKeywordsUpdate,
  processKeywordsAndTags,
} from "./dashboard";

export const createDashboardService = async (body: ICreateDashboardArgs) => {
  logger.info("dashboard.service.createDashboardService");
  try {
    const { name, tagCategories, keywords, location_name, clientId } = body;

    if (!clientId) {
      throw {
        name: "Error",
        message: "No client id was provided to create this dashboard",
        code: 400,
      };
    }

    // Start a new batch
    const batch = db.batch();

    const { dashboardRef, dashboardQuery } = await createOrUpdateDashboard(
      batch,
      db,
      body
    );

    const tagCategoryRefs = await createOrUpdateTagCategories(
      tagCategories,
      dashboardRef,
      batch,
      db
    );

    let shouldFetchNewData = true;

    if (!dashboardQuery.empty) {
      const lastUpdated = dashboardQuery.docs[0].data().lastUpdated?.toDate();
      if (lastUpdated) {
        const oneMonthAgo = new Date();
        oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);
        shouldFetchNewData = lastUpdated < oneMonthAgo;
      }
    }

    const searchVolumeResult = await fetchDataForSEO(
      keywords,
      location_name,
      name,
      shouldFetchNewData
    );

    const { keywordRefs } = await processKeywordsAndTags(
      keywords,
      dashboardRef,
      name,
      tagCategories,
      tagCategoryRefs,
      searchVolumeResult,
      shouldFetchNewData,
      batch,
      db
    );

    // Update dashboard with keyword references
    batch.set(
      dashboardRef,
      {
        keywords: keywordRefs,
      },
      { merge: true }
    );

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
  timeRange: number | null
) => {
  try {
    // Get dashboard document
    let dashboardDoc = await db.collection("dashboards").doc(dashboardId).get();

    // If not found, try by name
    if (!dashboardDoc.exists) {
      const nameQuery = await db
        .collection("dashboards")
        .where("id", "==", dashboardId)
        .limit(1)
        .get();

      if (nameQuery.empty) {
        return res.status(404).send({ error: "dashboard not found" });
      }
      dashboardDoc = nameQuery.docs[0];
    }

    const dashboardData = dashboardDoc.data();

    await monthlyKeywordsUpdate(dashboardData, dashboardId, dashboardDoc, db);

    // Fetch all references in parallel
    const [tagCategoryDocs, keywordDocs] = await Promise.all([
      // Get all tag categories in one batch
      dashboardData?.tagCategories && dashboardData?.tagCategories?.length
        ? db.getAll(...dashboardData.tagCategories)
        : [],
      // Get all keywords in one batch
      dashboardData?.keywords && dashboardData?.keywords?.length
        ? db.getAll(...dashboardData.keywords)
        : [],
    ]);

    // Process tag categories and their tags
    const tagCategories = tagCategoryDocs.map((categoryDoc) => {
      const categoryData = categoryDoc.data();
      // Get all tags for this category in one batch

      return {
        id: categoryDoc.id,
        name: categoryData?.name,
        tags: [] as any[],
      };
    });

    // Process keywords and their tags
    const keywordPromises = keywordDocs.map(async (doc) => {
      const keywordData = doc.data();
      const keyRow = keywordData?.dashboardRefs?.find(
        (d: any) => d.dashboardId === dashboardId
      );

      const calculateAverageSearchVolume = () => {
        return parseInt(keyRow.keyRow["Search Vol"] || "0", 10);
      };
      // logger.info('keywordDocs START');
      const searchVolume = calculateAverageSearchVolume() || 0;

      // logger.info('keywordDocs END', searchVolume);

      if (!keywordData?.tags?.length) {
        return {
          id: doc.id,
          ...keywordData,
          tags: [],
        };
      }

      // Get all tags for this keyword in one batch
      const tagDocs = await db.getAll(...keywordData.tags);

      // Get all tag categories for tags that have them
      const tagCategoryRefs = tagDocs
        .map((t) => t.data()?.tagCategoryRef)
        .filter((ref) => ref);

      const tagCategoryDocs = tagCategoryRefs.length
        ? await db.getAll(...tagCategoryRefs)
        : [];

      const tagCategoryMap = new Map(
        tagCategoryDocs.map((doc) => [
          doc.ref.path,
          { id: doc.id, ...doc.data() },
        ])
      );

      const tags = tagDocs.map((tagDoc) => {
        const tagData = tagDoc.data();
        const tagCategoryRef = tagData?.tagCategoryRef;

        if (tagCategoryRef) {
          const tagCategoryIndex = tagCategories.findIndex(
            (category: any) => category.name === tagData.tagCategory
          );

          if (tagCategoryIndex !== -1) {
            tagCategories[tagCategoryIndex].tags =
              tagCategories[tagCategoryIndex].tags || [];
            const tagIndex = tagCategories[tagCategoryIndex].tags.findIndex(
              (tag) => tag.name === tagData.name
            );

            // If the tag does not exist in the category, add it
            if (tagIndex === -1) {
              tagCategories[tagCategoryIndex].tags.push({
                id: tagDoc.id,
                ...tagData,
                avgSearchVolume: searchVolume,
                keywords: [keywordData?.name],
              });
            } else {
              // If the tag exists, update its average search volume and keywords
              const currentTag = tagCategories[tagCategoryIndex].tags[tagIndex];
              const newAvgSearchVolume =
                (currentTag.avgSearchVolume as number) + searchVolume;

              tagCategories[tagCategoryIndex].tags[tagIndex] = {
                ...currentTag,
                avgSearchVolume: newAvgSearchVolume,
                keywords: [...currentTag.keywords, keywordData?.name],
              };
            }
          }
        }

        return {
          id: tagDoc.id,
          ...tagData,
          ...(tagCategoryRef && {
            tagCategoryRef: tagCategoryMap.get(tagCategoryRef.path),
          }),
        };
      });

      return {
        id: doc.id,
        ...keywordData,
        tags,
      };
    });

    // Wait for all processing to complete
    const keywords = await Promise.all(keywordPromises);

    return {
      id: dashboardDoc.id,
      name: dashboardData?.name,
      logo: dashboardData?.logo,
      password: dashboardData?.password,
      suffix: dashboardData?.suffix,
      lastUpdated: dashboardData?.lastUpdated?.toMillis().toString(),
      visibleTagCategories: dashboardData?.visibleTagCategories,
      description: dashboardData?.description,
      tagCategories,
      keywords,
    };
  } catch (error: any) {
    const errorCode = error.code;
    const errorMessage = error.message;
    throw new Error(`${errorCode} ${errorMessage}`);
  }
};

export const getDashboardBySuffixService = async (
  dashboardSuffix: string,
  res: any,
  timeRange: number | null
) => {
  try {
    const suffixQuery = await db
      .collection("dashboards")
      .where("suffix", "==", dashboardSuffix)
      .limit(1)
      .get();

    if (suffixQuery.empty) {
      return res.status(404).send({ error: "dashboard not found" });
    }
    const dashboardDoc = suffixQuery.docs[0];

    const dashboardData = await getDashboardByIdService(
      dashboardDoc.id,
      res,
      timeRange
    );

    return dashboardData;
  } catch (error: any) {
    const errorCode = error.code;
    const errorMessage = error.message;
    throw new Error(`${errorCode} ${errorMessage}`);
  }
};

export const getDashboardByClientSuffixandDashboardSuffixService = async (
  clientSuffix: string,
  dashboardSuffix: string,
  res: any,
  timeRange: number | null
) => {
  try {
    const clientQuery = await db
      .collection("clients")
      .where("suffix", "==", clientSuffix)
      .limit(1)
      .get();

    if (clientQuery.empty) {
      return res.status(404).send({ error: "client not found" });
    }

    const suffixQuery = await db
      .collection("dashboards")
      .where("clientRef", "==", clientQuery.docs[0].ref)
      .where("suffix", "==", dashboardSuffix)
      .limit(1)
      .get();

    if (suffixQuery.empty) {
      return res.status(404).send({ error: "dashboard not found" });
    }
    const dashboardDoc = suffixQuery.docs[0];
    const dashboardData = await getDashboardByIdService(
      dashboardDoc.id,
      res,
      timeRange
    );

    return dashboardData;
  } catch (error: any) {
    const errorCode = error.code;
    const errorMessage = error.message;
    throw new Error(`${errorCode} ${errorMessage}`);
  }
};

export const deleteDashboardByIdService = async (
  dashboardId: string,
  db: admin.firestore.Firestore
): Promise<void> => {
  logger.info(`START delete dashboard ${dashboardId}`);

  const batch = db.batch();

  try {
    // Get the dashboard reference
    const dashboardRef = db.collection("dashboards").doc(dashboardId);
    const dashboardDoc = await dashboardRef.get();

    if (!dashboardDoc.exists) {
      throw new Error(`Dashboard with ID ${dashboardId} not found`);
    }

    // Delete all associated tag categories references
    const tagCategoryRefs = dashboardDoc.data()?.tagCategories || [];
    for (const tagCategoryRef of tagCategoryRefs) {
      batch.delete(tagCategoryRef);
    }

    // Delete the dashboard document itself
    batch.delete(dashboardRef);

    // Commit the batch
    await batch.commit();

    logger.info(`COMPLETE delete dashboard ${dashboardId}`);
  } catch (error) {
    logger.error(`Error deleting dashboard ${dashboardId}:`, error);
    throw error;
  }
};

export const updateDashboardService = async (
  dashboardId: string,
  body: {
    visibleTagCategories?: string[];
    logo?: string;
    password?: string;
    name?: string;
    suffix?: string;
    description?: string;
  }
) => {
  logger.info("dashboard.service.updateDashboardService");
  try {
    const dashboardRef = db.collection("dashboards").doc(dashboardId);
    const dashboardDoc = await dashboardRef.get();

    if (!dashboardDoc.exists) {
      throw new Error("Dashboard not found");
    }

    const updateData: Record<string, any> = {};

    if (body.visibleTagCategories !== undefined) {
      logger.info(`Visible tag categories ${body.visibleTagCategories}`);
      updateData.visibleTagCategories = body.visibleTagCategories;
    }
    if (body.logo !== undefined) {
      logger.info(`Logo ${body.logo}`);
      updateData.logo = body.logo;
    }
    if (body.password !== undefined) {
      logger.info(`Password ${body.password}`);
      updateData.password = body.password;
    }
    if (body.name !== undefined) {
      logger.info(`Name ${JSON.stringify(body.name)}`);
      updateData.name = body.name;
    }
    if (body.suffix !== undefined) {
      logger.info(`Suffix ${JSON.stringify(body.suffix)}`);
      updateData.suffix = body.suffix;
    }
    if (body.description !== undefined) {
      logger.info(`Description ${JSON.stringify(body.description)}`);
      updateData.description = body.description;
    }

    await dashboardRef.update(updateData);
    return dashboardRef;
  } catch (error: any) {
    const errorCode = error.code;
    const errorMessage = error.message;
    throw new Error(`${errorCode}: ${errorMessage}`);
  }
};
