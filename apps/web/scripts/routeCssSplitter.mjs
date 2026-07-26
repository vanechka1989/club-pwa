import postcss from "postcss";
import selectorParser from "postcss-selector-parser";

function categoryForRule(selectorText, categories) {
  const selectorCategories = [];

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
        selectorCategories.push(matches);
      });
    }).processSync(selectorText);
  } catch {
    return null;
  }

  if (!selectorCategories.length || selectorCategories.some((matches) => matches.size !== 1)) {
    return null;
  }

  const [firstCategory] = selectorCategories[0];
  return selectorCategories.every((matches) => matches.has(firstCategory)) ? firstCategory : null;
}

function appendWithAncestorRules(destination, rule) {
  let extractedNode = rule.clone();
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
  const routeRoots = Object.fromEntries(categories.map((category) => [category.name, postcss.root()]));
  const counts = Object.fromEntries(categories.map((category) => [category.name, 0]));
  const rules = [];
  globalRoot.walkRules((rule) => rules.push(rule));

  for (const rule of rules) {
    const category = categoryForRule(rule.selector, categories);
    if (!category) continue;

    appendWithAncestorRules(routeRoots[category], rule);
    counts[category] += 1;
    rule.remove();
  }

  pruneEmptyContainers(globalRoot);

  return {
    globalCss: globalRoot.toString(),
    routeCss: Object.fromEntries(Object.entries(routeRoots).map(([name, root]) => [name, root.toString()])),
    counts
  };
}
