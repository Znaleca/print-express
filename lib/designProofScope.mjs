const isInquiry = (message) => message?.message_type === "service_inquiry";

export function getInquiryForMessage(messages = [], message) {
  if (!message) return null;
  if (isInquiry(message)) return message;

  const explicitInquiryId = message.metadata?.inquiry_message_id;
  if (explicitInquiryId) {
    return messages.find((candidate) => isInquiry(candidate) && String(candidate.id) === String(explicitInquiryId)) || null;
  }

  const messageTime = Date.parse(message.created_at || "");
  if (!Number.isFinite(messageTime)) return null;
  const serviceId = message.metadata?.service_id;
  return messages
    .filter((candidate) => {
      if (!isInquiry(candidate)) return false;
      const inquiryTime = Date.parse(candidate.created_at || "");
      return Number.isFinite(inquiryTime)
        && inquiryTime <= messageTime
        && (!serviceId || String(candidate.metadata?.service_id) === String(serviceId));
    })
    .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at))[0] || null;
}

export function getProofsForInquiry(messages = [], inquiryId) {
  if (!inquiryId) return [];
  return messages.filter((message) => (
    message.message_type === "design_version"
    && message.metadata?.proof_id
    && message.metadata?.version
    && getInquiryForMessage(messages, message)?.id === inquiryId
  ));
}
