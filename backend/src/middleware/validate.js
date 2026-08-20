export const validateBody = (schema) => {
  return async (req, res, next) => {
    try {
      // Parse & validate body, replacing req.body with the sanitized/parsed data
      req.body = await schema.parseAsync(req.body);
      next();
    } catch (err) {
      // Format Zod errors into a clean key-value dictionary or list
      const errors = {};
      if (err.errors) {
        err.errors.forEach((e) => {
          const key = e.path.join('.');
          errors[key] = e.message;
        });
      }

      res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: Object.keys(errors).length > 0 ? errors : err.message,
      });
    }
  };
};
