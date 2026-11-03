export const JOB_STATUS = Object.freeze({
  SUCCEEDED: 'succeeded',
  FAILED: 'failed',
  TIMED_OUT: 'timed_out',
});
export const JOB_STATUSES = Object.freeze(Object.values(JOB_STATUS));

export const JOB_NAME_PATTERN = /^[a-z][a-z0-9-]*$/;
