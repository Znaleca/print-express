export async function withTimeout(queryFactory, timeoutMs = 8000, timeoutMessage = "The request timed out. Please try again.") {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await queryFactory(controller.signal);
  } catch (error) {
    if (error?.name === "AbortError") {
      throw new Error(timeoutMessage);
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}
