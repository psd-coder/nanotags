import type { ContextsSchema, PropsSchema, RefsSchema, StrictPropEntry } from "./types";
import type { ComponentCtor, SetupFn, SetupContext } from "./setup-context";
import { propBuilders, refBuilders } from "./builders";
import { createComponent } from "./factory";

export class ComponentBuilder<
  Name extends string,
  // oxlint-disable-next-line typescript-eslint/no-empty-object-type
  Props extends PropsSchema = {},
  // oxlint-disable-next-line typescript-eslint/no-empty-object-type
  Refs extends RefsSchema = {},
  // oxlint-disable-next-line typescript-eslint/no-empty-object-type
  Contexts extends ContextsSchema = {},
> {
  readonly name: Name;
  readonly propsSchema: Props;
  readonly refsSchema: Refs;
  readonly contextsSchema: Contexts;

  constructor(
    name: Name,
    propsSchema: Props = {} as Props,
    refsSchema: Refs = {} as Refs,
    contextsSchema: Contexts = {} as Contexts,
  ) {
    this.name = name;
    this.propsSchema = propsSchema;
    this.refsSchema = refsSchema;
    this.contextsSchema = contextsSchema;
  }

  withProps<P extends PropsSchema>(
    factory: (builders: typeof propBuilders) => P & { [K in keyof P]: StrictPropEntry<P[K]> },
  ): ComponentBuilder<Name, Props & P, Refs, Contexts> {
    const newProps = factory(propBuilders);
    return new ComponentBuilder(
      this.name,
      { ...this.propsSchema, ...newProps } as Props & P,
      this.refsSchema,
      this.contextsSchema,
    );
  }

  withRefs<R extends RefsSchema>(
    factory: (builders: typeof refBuilders) => R,
  ): ComponentBuilder<Name, Props, Refs & R, Contexts> {
    const newRefs = factory(refBuilders);
    return new ComponentBuilder(
      this.name,
      this.propsSchema,
      {
        ...this.refsSchema,
        ...newRefs,
      } as Refs & R,
      this.contextsSchema,
    );
  }

  withContexts<C extends ContextsSchema>(
    contexts: C,
  ): ComponentBuilder<Name, Props, Refs, Contexts & C> {
    return new ComponentBuilder(this.name, this.propsSchema, this.refsSchema, {
      ...this.contextsSchema,
      ...contexts,
    } as Contexts & C);
  }

  // oxlint-disable-next-line typescript-eslint/no-empty-object-type
  setup<M extends Record<string, unknown> = {}>(
    setupFn: (ctx: SetupContext<Props, Refs, Contexts>) => M | void,
  ): ComponentCtor<Props, Refs, M, Contexts> {
    return createComponent<Props, Refs, M, Contexts>(
      this.name,
      this.propsSchema,
      this.refsSchema,
      setupFn as SetupFn<Props, Refs, Contexts>,
      this.contextsSchema,
    );
  }
}

export function define<const Name extends string>(name: Name): ComponentBuilder<Name>;
export function define<
  const Name extends string,
  // oxlint-disable-next-line typescript-eslint/no-empty-object-type
  M extends Record<string, unknown> = {},
>(
  name: Name,
  // oxlint-disable-next-line typescript-eslint/no-empty-object-type
  setup: (ctx: SetupContext<{}, {}>) => M | void,
  // oxlint-disable-next-line typescript-eslint/no-empty-object-type
): ComponentCtor<{}, {}, M>;
export function define<const Name extends string>(
  name: Name,
  // oxlint-disable-next-line typescript-eslint/no-empty-object-type
  setup?: SetupFn<{}, {}>,
) {
  if (setup) {
    // oxlint-disable-next-line typescript-eslint/no-empty-object-type
    return createComponent(name, {} as {}, {} as {}, setup);
  }
  return new ComponentBuilder(name);
}
