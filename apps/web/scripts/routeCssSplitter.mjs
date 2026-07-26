import postcss from "postcss";
import selectorParser from "postcss-selector-parser";

function partitionRuleSelectors(selectorText, categories) {
  const selectors = [];

  try {
    selectorParser((root) => {
      root.each((selector) => {
        const matches = new Set();
        selector.walkClasses((classNode) => {
          for (const category of categories) {
            if (category.classPatterns.some((pattern) => pattern.test(classNode.value))) {
              matches.add(category.name);
            }
          }
        });
        selectors.push({
          selector: selector.toString().trim(),
          category: matches.size === 1 ? [...matches][0] : null
        });
      });
    }).processSync(selectorText);
  } catch {
    return null;
  }

  return selectors.length ? selectors : null;
}

function appendWithAncestorRules(destination, rule, selector = rule.selector) {
  let extractedNode = rule.clone({ selector });
  let parent = rule.parent;

  while (parent && parent.type !== "root") {
    const wrapper = parent.clone({ nodes: [] });
    wrapper.append(extractedNode);
    extractedNode = wrapper;
    parent = parent.parent;
  }

  destination.append(extractedNode);
}

function pruneEmptyContainers(root) {
  let removed = true;
  while (removed) {
    removed = false;
    root.walkAtRules((atRule) => {
      if (Array.isArray(atRule.nodes) && atRule.nodes.length === 0) {
        atRule.remove();
        removed = true;
      }
    });
  }
}

export function splitRouteCss(source, categories) {
  const globalRoot = postcss.parse(source);
  const finalMobileGuardOffset = source.indexOf("Final mobile modal guard");
  const routeRoots = Object.fromEntries(categories.map((category) => [category.name, postcss.root()]));
  const counts = Object.fromEntries(categories.map((category) => [category.name, 0]));
  const rules = [];
  globalRoot.walkRules((rule) => rules.push(rule));

  for (const rule of rules) {
    if (finalMobileGuardOffset >= 0 && (rule.source?.start?.offset ?? 0) >= finalMobileGuardOffset) continue;
    const selectors = partitionRuleSelectors(rule.selector, categories);
    if (!selectors) continue;
    const ownedCategories = new Set(selectors.map((entry) => entry.category).filter(Boolean));
    if (ownedCategories.size !== 1) continue;
    const [ownedCategory] = ownedCategories;

    const routeSelectors = selectors.filter((entry) => entry.category === ownedCategory).map((entry) => entry.selector);
    appendWithAncestorRules(routeRoots[ownedCategory], rule, routeSelectors.join(", "));
    counts[ownedCategory] += 1;

    const globalSelectors = selectors.filter((entry) => entry.category === null).map((entry) => entry.selector);
    if (globalSelectors.length) {
      rule.selector = globalSelectors.join(", ");
    } else {
      rule.remove();
    }
  }

  pruneEmptyContainers(globalRoot);

  return {
    globalCss: globalRoot.toString(),
    routeCss: Object.fromEntries(Object.entries(routeRoots).map(([name, root]) => [name, root.toString()])),
    counts
  };
}
