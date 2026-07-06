import { useCallback, useEffect, useRef, useState } from "react";
import { createWatermarkImageCount, getWatermarkImageCountTotal } from "../services/watermarkImageCountService.js";

const DOANTRANG_COUNT_SOURCE_PAGE = "watermark/doantrang";
const DOANTRANG_IMAGE_MILESTONES = [
  800, 1000, 1200, 1500, 2000, 2500, 3000, 4000, 5000, 6000, 7000, 8000, 9000,
  10000,
];

function getReachedImageMilestone(previousCount, nextCount) {
  const previous = Number(previousCount) || 0;
  const next = Number(nextCount) || 0;

  if (next <= previous) return null;

  const fixedMilestone = DOANTRANG_IMAGE_MILESTONES.filter(
    (milestone) => previous < milestone && next >= milestone,
  ).at(-1);

  if (fixedMilestone) {
    return fixedMilestone;
  }

  if (next > 1000) {
    const previousThousand = Math.floor(previous / 1000);
    const nextThousand = Math.floor(next / 1000);

    if (nextThousand > previousThousand) {
      return nextThousand * 1000;
    }
  }

  return null;
}

export function useWatermarkStats(visitorId) {
  const [totalCreated, setTotalCreated] = useState(0);
  const [personalCreated, setPersonalCreated] = useState(0);
  const [lastCreated, setLastCreated] = useState(0);
  const [statsLoading, setStatsLoading] = useState(true);
  const [statsError, setStatsError] = useState(null);
  const [milestoneCelebration, setMilestoneCelebration] = useState(null);
  const personalCreatedRef = useRef(0);

  useEffect(() => {
    personalCreatedRef.current = personalCreated;
  }, [personalCreated]);

  useEffect(() => {
    if (!visitorId) {
      return undefined;
    }

    let isActive = true;

    Promise.all([
      getWatermarkImageCountTotal({ sourcePage: DOANTRANG_COUNT_SOURCE_PAGE }),
      getWatermarkImageCountTotal({
        sourcePage: DOANTRANG_COUNT_SOURCE_PAGE,
        visitorId,
      }),
    ]).then(([totalResult, personalResult]) => {
      if (!isActive) return;

      if (totalResult.error || personalResult.error) {
        setStatsError(totalResult.error || personalResult.error);
      } else {
        setStatsError(null);
      }

      setTotalCreated(totalResult.data || 0);
      setPersonalCreated(personalResult.data || 0);
      personalCreatedRef.current = personalResult.data || 0;
      setStatsLoading(false);
    });

    return () => {
      isActive = false;
    };
  }, [visitorId]);

  const recordCreated = useCallback(
    async ({ userId, displayName, imageCount }) => {
      const normalizedCount = Number(imageCount) || 0;

      if (!visitorId || normalizedCount <= 0) {
        return;
      }

      const result = await createWatermarkImageCount({
        userId,
        visitorId,
        displayName,
        imageCount: normalizedCount,
        sourcePage: DOANTRANG_COUNT_SOURCE_PAGE,
      });

      if (result.error) {
        console.warn(
          "[DoanTrangWatermark] Could not save image count",
          result.error,
        );
        return;
      }

      const previousPersonalCreated = personalCreatedRef.current;
      const nextPersonalCreated = previousPersonalCreated + normalizedCount;
      const reachedMilestone = getReachedImageMilestone(
        previousPersonalCreated,
        nextPersonalCreated,
      );

      personalCreatedRef.current = nextPersonalCreated;
      setTotalCreated((current) => current + normalizedCount);
      setPersonalCreated(nextPersonalCreated);
      setLastCreated(normalizedCount);
      setStatsError(null);

      if (reachedMilestone) {
        setMilestoneCelebration({
          milestone: reachedMilestone,
          justCreated: normalizedCount,
        });
      }
    },
    [visitorId],
  );

  const closeMilestoneCelebration = useCallback(() => {
    setMilestoneCelebration(null);
  }, []);

  return {
    totalCreated,
    personalCreated,
    lastCreated,
    statsLoading,
    statsError,
    milestoneCelebration,
    recordCreated,
    closeMilestoneCelebration,
  };
}
