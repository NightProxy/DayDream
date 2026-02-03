import type { InferAttributes, InferCreationAttributes } from "sequelize";
import { Model } from "sequelize";

interface Catalog {
  package_name: string;
  title: string;
  description: string;
  author: string;
  image: string;
  version: string;
  function: string;

  sites: string[] | string;
}

interface CatalogModel
  extends Catalog,
    Model<
      InferAttributes<CatalogModel>,
      InferCreationAttributes<CatalogModel>
    > {}

export { Catalog, CatalogModel };
