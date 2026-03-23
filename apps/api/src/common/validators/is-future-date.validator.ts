import { registerDecorator, ValidationOptions } from 'class-validator';

/**
 * Validates that an ISO8601 date string represents a point in time strictly
 * after now. Apply after @IsISO8601() so the format is already confirmed valid.
 */
export function IsFutureDate(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'isFutureDate',
      target: object.constructor,
      propertyName,
      options: {
        message: `${propertyName} must be a future date`,
        ...validationOptions,
      },
      validator: {
        validate(value: unknown): boolean {
          if (typeof value !== 'string') return false;
          const date = new Date(value);
          return !isNaN(date.getTime()) && date > new Date();
        },
      },
    });
  };
}
