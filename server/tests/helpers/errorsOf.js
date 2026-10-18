/** Returns a document's validation errors keyed by field, or {} when it is valid. */
export async function errorsOf(doc) {
  try {
    await doc.validate();
    return {};
  } catch (err) {
    return err.errors;
  }
}
