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

export function ratingLabel(value) {
  return value == null ? "No ratings yet" : Number(value).toFixed(1);
}
