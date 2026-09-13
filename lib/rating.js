export function getRatingStats(reviews = []) {
  const ratedReviews = reviews.filter((review) => Number.isFinite(Number(review?.rating)));

  if (ratedReviews.length === 0) {
    return { average: null, count: 0 };
  }

  const total = ratedReviews.reduce((sum, review) => sum + Number(review.rating), 0);
  return {
    average: Number((total / ratedReviews.length).toFixed(1)),
    count: ratedReviews.length,
  };
}

export function getRatingSummary(reviews = []) {
  const ratedReviews = reviews.filter((review) => {
    const rating = Number(review?.rating);
    return Number.isFinite(rating) && rating >= 1 && rating <= 5;
  });
  return {
    ...getRatingStats(ratedReviews),
    distribution: [5, 4, 3, 2, 1].map((rating) => ({
      rating,
      count: ratedReviews.filter((review) => Number(review.rating) === rating).length,
    })),
  };
}

export function ratingLabel(value) {
  return value == null ? "No ratings yet" : Number(value).toFixed(1);
}
