
import ProductModel from "../models/product.model.js";
import ProductCategoryModel from "../models/productCategory.model.js";
import {
    uploadToCloudinary,
    deleteFromCloudinary
} from "../utils/cloudinary.js";
import mongoose from "mongoose";

const isValidObjectId = (id) =>
    typeof id === "string" && mongoose.Types.ObjectId.isValid(id);

const parseJSON = (value, defaultValue) => {
    if (value === undefined || value === null || value === "") {
        return defaultValue;
    }

    if (typeof value !== "string") {
        return value;
    }

    try {
        return JSON.parse(value);
    } catch {
        throw new Error("Invalid JSON data in request");
    }
};

const parseStatus = (value, defaultValue = true) => {
    if (value === undefined || value === null || value === "") {
        return defaultValue;
    }

    if (typeof value === "boolean") return value;
    if (value === "true") return true;
    if (value === "false") return false;

    throw new Error("Status must be true or false");
};

const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const getFiles = (req, field) => req.files?.[field] || [];

const removeCloudinaryImages = async (urls = []) => {
    for (const url of new Set(urls.filter(Boolean))) {
        try {
            await deleteFromCloudinary(url);
        } catch (error) {
            console.error("Cloudinary delete error:", error.message);
        }
    }
};

const uploadImage = async (file, publicId) => {
    if (!file) return null;

    const result = await uploadToCloudinary(file.buffer, publicId);

    if (!result?.secure_url) {
        throw new Error("Image upload failed");
    }

    return result.secure_url;
};

const validateFlavour = (flavour) =>
    flavour &&
    typeof flavour === "object" &&
    !Array.isArray(flavour) &&
    typeof flavour.name === "string" &&
    Boolean(flavour.name.trim()) &&
    typeof flavour.des === "string" &&
    Boolean(flavour.des.trim());

const validateMaking = (making) =>
    making &&
    typeof making === "object" &&
    !Array.isArray(making) &&
    (making.description === undefined ||
        typeof making.description === "string") &&
    Array.isArray(making.steps) &&
    making.steps.every(
        (step) =>
            step &&
            typeof step === "object" &&
            Number.isFinite(Number(step.step)) &&
            typeof step.description === "string"
    );

const validateRecipe = (recipe) =>
    Array.isArray(recipe) && recipe.every(isValidObjectId);

const validateSeo = (seo) =>
    seo &&
    typeof seo === "object" &&
    !Array.isArray(seo);

const getProductImageUrls = (product) => [
    product.featureImage,
    product.image,
    product.bottleImage,
    ...(product.variants || []).flatMap((variant) => [
        variant.image,
        variant.banners,
        variant.label
    ]),
    ...(product.making?.steps || []).map((step) => step.image),
    product.seo?.ogImage,
    product.seo?.twitterImage,
    product.seo?.facebookImage,
    ...(product.review || []).flatMap((review) => review.image || [])
].filter(Boolean);

const getVariantObjects = (variants = []) =>
    variants.map((variant) =>
        variant?.toObject ? variant.toObject() : { ...variant }
    );

const getMakingObject = (making) => {
    if (!making) return { description: "", steps: [] };

    return making.toObject
        ? making.toObject()
        : {
            ...making,
            steps: (making.steps || []).map((step) =>
                step?.toObject ? step.toObject() : { ...step }
            )
        };
};

const uploadProductImages = async (
    data,
    files,
    slug,
    uploadedImages
) => {
    const result = { ...data };

    const mainFields = [
        ["featureImage", "featureImage", "feature"],
        ["image", "image", "image"],
        ["bottleImage", "bottle", "bottle"],
    ];

    for (const [dataField, fileField, suffix] of mainFields) {
        const file = files[fileField]?.[0];

        if (file) {
            const url = await uploadImage(file, `${slug}-${suffix}`);

            uploadedImages.push(url);
            result[dataField] = url;
        }
    }

    result.variants = getVariantObjects(data.variants || []);

    const variantFiles = files.variant || [];
    const bannerFiles = files.banners || [];
    const labelFiles = files.label || [];

    let nextVariantFileIndex = 0;
    let nextBannerFileIndex = 0;
    let nextLabelFileIndex = 0;

    for (let i = 0; i < result.variants.length; i++) {
        const variant = result.variants[i];

        const rawVariantIndex = variant.variantUploadIndex;
        const rawBannerIndex = variant.bannerUploadIndex;
        const rawLabelIndex = variant.labelUploadIndex;

        const variantUploadIndex =
            rawVariantIndex !== undefined &&
            rawVariantIndex !== null &&
            rawVariantIndex !== ""
                ? Number(rawVariantIndex)
                : null;

        const bannerUploadIndex =
            rawBannerIndex !== undefined &&
            rawBannerIndex !== null &&
            rawBannerIndex !== ""
                ? Number(rawBannerIndex)
                : null;

        const labelUploadIndex =
            rawLabelIndex !== undefined &&
            rawLabelIndex !== null &&
            rawLabelIndex !== ""
                ? Number(rawLabelIndex)
                : null;

        let variantFile;
        let bannerFile;
        let labelFile;

        if (
            variantUploadIndex !== null &&
            Number.isInteger(variantUploadIndex) &&
            variantUploadIndex >= 0
        ) {
            variantFile = variantFiles[variantUploadIndex];
        } else if (
            !variant.image &&
            nextVariantFileIndex < variantFiles.length
        ) {
            variantFile = variantFiles[nextVariantFileIndex];
            nextVariantFileIndex++;
        }

        if (
            bannerUploadIndex !== null &&
            Number.isInteger(bannerUploadIndex) &&
            bannerUploadIndex >= 0
        ) {
            bannerFile = bannerFiles[bannerUploadIndex];
        } else if (
            !variant.banners &&
            nextBannerFileIndex < bannerFiles.length
        ) {
            bannerFile = bannerFiles[nextBannerFileIndex];
            nextBannerFileIndex++;
        }

        if (
            labelUploadIndex !== null &&
            Number.isInteger(labelUploadIndex) &&
            labelUploadIndex >= 0
        ) {
            labelFile = labelFiles[labelUploadIndex];
        } else if (
            !variant.label &&
            nextLabelFileIndex < labelFiles.length
        ) {
            labelFile = labelFiles[nextLabelFileIndex];
            nextLabelFileIndex++;
        }

        if (variantFile) {
            const url = await uploadImage(
                variantFile,
                `${slug}-variant-${i + 1}`
            );

            uploadedImages.push(url);
            variant.image = url;
        }

        if (bannerFile) {
            const url = await uploadImage(
                bannerFile,
                `${slug}-variant-banner-${i + 1}`
            );

            uploadedImages.push(url);
            variant.banners = url;
        }

        if (labelFile) {
            const url = await uploadImage(
                labelFile,
                `${slug}-variant-label-${i + 1}`
            );

            uploadedImages.push(url);
            variant.label = url;
        }

        delete variant.variantUploadIndex;
        delete variant.bannerUploadIndex;
        delete variant.labelUploadIndex;
    }

    result.making = getMakingObject(data.making);

    const makingSteps = await Promise.all(
        (result.making.steps || []).map(async (step, stepIndex) => {
            const rawUploadIndex = step.imageUploadIndex;

            const uploadIndex =
                rawUploadIndex === null ||
                rawUploadIndex === undefined ||
                rawUploadIndex === ""
                    ? null
                    : Number(rawUploadIndex);

            let image = step.image || "";

            if (
                uploadIndex !== null &&
                Number.isInteger(uploadIndex) &&
                uploadIndex >= 0 &&
                files.steps?.[uploadIndex]
            ) {
                const url = await uploadImage(
                    files.steps[uploadIndex],
                    `${slug}-step-${step.step || stepIndex + 1}`
                );

                uploadedImages.push(url);
                image = url;
            }

            return {
                step: Number(step.step) || stepIndex + 1,
                description: step.description || "",
                image,
            };
        })
    );

    result.making.steps = makingSteps;

    return result;
};


const parsePagination = (query) => {
    const pageValue = Number.parseInt(query.page, 10);
    const limitValue = Number.parseInt(query.limit, 10);

    const page = Math.max(Number.isFinite(pageValue) ? pageValue : 1, 1);
    const limit = Math.min(
        Math.max(Number.isFinite(limitValue) ? limitValue : 20, 1),
        100
    );

    return {
        page,
        limit,
        skip: (page - 1) * limit
    };
};

export const addProduct = async (req, res) => {
    const uploadedImages = [];

    try {
        const {
            categoryId,
            name,
            slug,
            description,
            shortDes,
            flavour,
            serve,
            spirits,
            pairs,
            nutrition,
            intgredient,
            variants,
            making,
            seo,
            faq,
            recipe,
            status,
            colors
        } = req.body;

        if (
            !categoryId?.trim() ||
            !name?.trim() ||
            !slug?.trim() ||
            !description?.trim() ||
            !shortDes?.trim() ||
            !serve?.trim()
        ) {
            return res.status(400).json({
                success: false,
                message:
                    "Category, name, slug, description, short description and serving instructions are required"
            });
        }

        if (!isValidObjectId(categoryId.trim())) {
            return res.status(400).json({
                success: false,
                message: "Invalid categoryId"
            });
        }

        const categoryExists = await ProductCategoryModel.exists({
            _id: categoryId.trim()
        });

        if (!categoryExists) {
            return res.status(404).json({
                success: false,
                message: "Product category not found"
            });
        }

        const files = {
            featureImage: getFiles(req, "featureImage"),
            image: getFiles(req, "image"),
            bottle: getFiles(req, "bottle"),
            variant: getFiles(req, "variant"),
            banners: getFiles(req, "banners"),
            label: getFiles(req, "label"),
            steps: getFiles(req, "steps")
        };

        if (
            !files.featureImage[0] ||
            !files.image[0] ||
            !files.bottle[0]
        ) {
            return res.status(400).json({
                success: false,
                message:
                    "Feature image, product image and bottle image are required"
            });
        }

        const data = {
            flavour: parseJSON(flavour, {}),
            spirits: parseJSON(spirits, []),
            pairs: parseJSON(pairs, []),
            nutrition: parseJSON(nutrition, []),
            variants: parseJSON(variants, []),
            making: parseJSON(making, { description: "", steps: [] }),
            seo: parseJSON(seo, {}),
            faq: parseJSON(faq, []),
            recipe: parseJSON(recipe, []),
            colors: parseJSON(colors, []),
        };

        if (!validateFlavour(data.flavour)) {
            return res.status(400).json({
                success: false,
                message: "Flavour name and description are required"
            });
        }

        for (const field of [
            "spirits",
            "pairs",
            "nutrition",
            "variants",
            "faq",
            "recipe"
        ]) {
            if (!Array.isArray(data[field])) {
                return res.status(400).json({
                    success: false,
                    message: `${field} must be an array`
                });
            }
        }

        if (!validateMaking(data.making)) {
            return res.status(400).json({
                success: false,
                message: "Making must contain a description and valid steps"
            });
        }

        if (!validateSeo(data.seo)) {
            return res.status(400).json({
                success: false,
                message: "SEO must be an object"
            });
        }

        if (!validateRecipe(data.recipe)) {
            return res.status(400).json({
                success: false,
                message: "Recipe must contain valid recipe IDs"
            });
        }

        if (
            files.variant.length > data.variants.length ||
            files.banners.length > data.variants.length ||
            files.steps.length > data.making.steps.length
        ) {
            return res.status(400).json({
                success: false,
                message:
                    "Uploaded variant, banner or step images exceed their corresponding array length"
            });
        }

        const parsedStatus = parseStatus(status, true);

        const duplicate = await ProductModel.findOne({
            slug: slug.trim()
        });

        if (duplicate) {
            return res.status(409).json({
                success: false,
                message: "Duplicate Product Slug"
            });
        }

        const productData = await uploadProductImages(
            {
                featureImage: undefined,
                image: undefined,
                bottleImage: undefined,
                ...data
            },
            files,
            slug.trim(),
            uploadedImages
        );

        const product = await ProductModel.create({
            categoryId: categoryId.trim(),
            name: name.trim(),
            slug: slug.trim(),
            description: description.trim(),
            shortDes: shortDes.trim(),
            featureImage: productData.featureImage,
            image: productData.image,
            bottleImage: productData.bottleImage,
            flavour: productData.flavour,
            serve: serve.trim(),
            spirits: productData.spirits,
            pairs: productData.pairs,
            nutrition: productData.nutrition,
            intgredient: intgredient ?? "",
            variants: productData.variants,
            making: productData.making,
            recipe: productData.recipe,
            seo: productData.seo,
            faq: productData.faq,
            status: parsedStatus,
            colors: productData.colors
        });

        return res.status(201).json({
            success: true,
            message: "Product added successfully",
            product
        });
    } catch (error) {
        await removeCloudinaryImages(uploadedImages);

        console.error("Add Product Error:", error);

        return res.status(500).json({
            success: false,
            message: error.message || "Failed to add product"
        });
    }
};

export const updateProduct = async (req, res) => {
    const uploadedImages = [];

    try {
        const { id } = req.params;

        if (!isValidObjectId(id)) {
            return res.status(400).json({
                success: false,
                message: "A valid Product ID is required",
            });
        }

        const product = await ProductModel.findById(id);

        if (!product) {
            return res.status(404).json({
                success: false,
                message: "Product not found",
            });
        }

        const {
            categoryId,
            name,
            slug,
            description,
            shortDes,
            flavour,
            serve,
            spirits,
            pairs,
            nutrition,
            intgredient,
            variants,
            making,
            seo,
            faq,
            recipe,
            status,
            colors,
        } = req.body;

        const parsedName =
            name !== undefined ? String(name).trim() : product.name;

        const parsedSlug =
            slug !== undefined ? String(slug).trim() : product.slug;

        if (!parsedName || !parsedSlug) {
            return res.status(400).json({
                success: false,
                message: "Product name and slug are required",
            });
        }

        if (
            (description !== undefined && !String(description).trim()) ||
            (shortDes !== undefined && !String(shortDes).trim()) ||
            (serve !== undefined && !String(serve).trim())
        ) {
            return res.status(400).json({
                success: false,
                message: "Provided text fields cannot be empty",
            });
        }

        if (categoryId !== undefined) {
            if (
                typeof categoryId !== "string" ||
                !categoryId.trim() ||
                !isValidObjectId(categoryId.trim())
            ) {
                return res.status(400).json({
                    success: false,
                    message: "Invalid categoryId",
                });
            }

            const categoryExists = await ProductCategoryModel.exists({
                _id: categoryId.trim(),
            });

            if (!categoryExists) {
                return res.status(404).json({
                    success: false,
                    message: "Product category not found",
                });
            }

            product.categoryId = categoryId.trim();
        }

        if (parsedSlug !== product.slug) {
            const duplicate = await ProductModel.findOne({
                slug: parsedSlug,
                _id: { $ne: product._id },
            });

            if (duplicate) {
                return res.status(409).json({
                    success: false,
                    message: "Duplicate Product Slug",
                });
            }
        }

        const parsed = {};

        if (flavour !== undefined) {
            parsed.flavour = parseJSON(flavour, {});

            if (!validateFlavour(parsed.flavour)) {
                return res.status(400).json({
                    success: false,
                    message: "Flavour name and description are required",
                });
            }
        }

        const arrayFields = [
            "spirits",
            "pairs",
            "nutrition",
            "variants",
            "faq",
            "recipe",
            "colors",
        ];

        for (const field of arrayFields) {
            if (
                Object.prototype.hasOwnProperty.call(req.body, field)
            ) {
                parsed[field] = parseJSON(req.body[field], []);

                if (!Array.isArray(parsed[field])) {
                    return res.status(400).json({
                        success: false,
                        message: `${field} must be an array`,
                    });
                }
            }
        }

        if (
            parsed.recipe !== undefined &&
            !validateRecipe(parsed.recipe)
        ) {
            return res.status(400).json({
                success: false,
                message: "Recipe must contain valid recipe IDs",
            });
        }

        if (parsed.colors !== undefined) {
            const invalidColor = parsed.colors.some(
                (color) =>
                    !color ||
                    typeof color.name !== "string" ||
                    typeof color.hex !== "string"
            );

            if (invalidColor) {
                return res.status(400).json({
                    success: false,
                    message: "Each color must contain a name and hex value",
                });
            }
        }

        if (making !== undefined) {
            parsed.making = parseJSON(making, null);

            if (
                !parsed.making ||
                typeof parsed.making !== "object" ||
                !Array.isArray(parsed.making.steps)
            ) {
                return res.status(400).json({
                    success: false,
                    message: "Making must contain a valid steps array",
                });
            }

            parsed.making = {
                description: parsed.making.description || "",
                steps: parsed.making.steps.map((step, index) => ({
                    step: index + 1,
                    description: step.description || "",
                    image: step.image || "",
                    ...(Number.isInteger(step.imageUploadIndex)
                        ? { imageUploadIndex: step.imageUploadIndex }
                        : {}),
                })),
            };

            if (!validateMaking(parsed.making)) {
                return res.status(400).json({
                    success: false,
                    message: "Making contains invalid steps",
                });
            }
        }

        if (seo !== undefined) {
            parsed.seo = parseJSON(seo, {});

            if (!validateSeo(parsed.seo)) {
                return res.status(400).json({
                    success: false,
                    message: "SEO must be an object",
                });
            }
        }

        const parsedStatus =
            status !== undefined
                ? parseStatus(status, product.status)
                : product.status;

        const files = {
            featureImage: getFiles(req, "featureImage"),
            image: getFiles(req, "image"),
            bottle: getFiles(req, "bottle"),
            variant: getFiles(req, "variant"),
            banners: getFiles(req, "banners"),
            label: getFiles(req, "label"),
            steps: getFiles(req, "steps"),
        };

        const nextVariants =
            parsed.variants !== undefined
                ? parsed.variants
                : getVariantObjects(product.variants);

        const nextMaking =
            parsed.making !== undefined
                ? parsed.making
                : getMakingObject(product.making);

        if (
            files.variant.length > nextVariants.length ||
            files.banners.length > nextVariants.length ||
            files.label.length > nextVariants.length ||
            files.steps.length > (nextMaking?.steps?.length || 0)
        ) {
            return res.status(400).json({
                success: false,
                message:
                    "Uploaded images must match their corresponding variants or making steps",
            });
        }

        if (
            (
                files.variant.length ||
                files.banners.length ||
                files.label.length
            ) &&
            variants === undefined
        ) {
            return res.status(400).json({
                success: false,
                message:
                    "Send variants when uploading variant, banner, or label images",
            });
        }

        if (files.steps.length && making === undefined) {
            return res.status(400).json({
                success: false,
                message: "Send making when uploading step images",
            });
        }

        const oldImageUrls = getProductImageUrls(product);

        product.name = parsedName;
        product.slug = parsedSlug;

        if (description !== undefined) {
            product.description = description.trim();
        }

        if (shortDes !== undefined) {
            product.shortDes = shortDes.trim();
        }

        if (serve !== undefined) {
            product.serve = serve.trim();
        }

        if (parsed.flavour !== undefined) {
            product.flavour = parsed.flavour;
        }

        if (parsed.spirits !== undefined) {
            product.spirits = parsed.spirits;
        }

        if (parsed.pairs !== undefined) {
            product.pairs = parsed.pairs;
        }

        if (parsed.nutrition !== undefined) {
            product.nutrition = parsed.nutrition;
        }

        if (parsed.faq !== undefined) {
            product.faq = parsed.faq;
        }

        if (parsed.recipe !== undefined) {
            product.recipe = parsed.recipe;
        }

        if (parsed.variants !== undefined) {
            product.variants = parsed.variants;
        }

        if (parsed.making !== undefined) {
            product.making = parsed.making;
        }

        if (parsed.seo !== undefined) {
            product.seo = parsed.seo;
        }

        if (intgredient !== undefined) {
            product.intgredient = intgredient;
        }

        if (parsed.colors !== undefined) {
            product.colors = parsed.colors;
        }

        product.status = parsedStatus;

        const productData = await uploadProductImages(
            {
                featureImage: product.featureImage,
                image: product.image,
                bottleImage: product.bottleImage,
                variants: nextVariants,
                making: nextMaking,
            },
            files,
            parsedSlug,
            uploadedImages
        );

        if (files.featureImage.length) {
            product.featureImage = productData.featureImage;
        }

        if (files.image.length) {
            product.image = productData.image;
        }

        if (files.bottle.length) {
            product.bottleImage = productData.bottleImage;
        }

        if (
            parsed.variants !== undefined ||
            files.variant.length ||
            files.banners.length ||
            files.label.length
        ) {
            product.variants = productData.variants;
        }

        if (parsed.making !== undefined || files.steps.length) {
            product.making = productData.making;
        }

        await product.save();

        const newImageUrls = getProductImageUrls(product);
        const retainedUrls = new Set(newImageUrls);

        const imagesToDelete = oldImageUrls.filter(
            (url) => !retainedUrls.has(url)
        );

        if (imagesToDelete.length) {
            await removeCloudinaryImages(imagesToDelete);
        }

        return res.status(200).json({
            success: true,
            message: "Product updated successfully",
            product,
        });
    } catch (error) {
        if (uploadedImages.length) {
            try {
                await removeCloudinaryImages(uploadedImages);
            } catch (cleanupError) {
                console.error(
                    "Uploaded image cleanup failed:",
                    cleanupError
                );
            }
        }

        console.error("Update Product Error:", error);

        return res.status(500).json({
            success: false,
            message: error.message || "Failed to update product",
        });
    }
};

export const deleteProduct = async (req, res) => {
    try {
        const { id } = req.params;

        if (!isValidObjectId(id)) {
            return res.status(400).json({
                success: false,
                message: "A valid Product ID is required"
            });
        }

        const product = await ProductModel.findById(id);

        if (!product) {
            return res.status(404).json({
                success: false,
                message: "Product not found"
            });
        }

        const imageUrls = getProductImageUrls(product);

        await ProductModel.findByIdAndDelete(id);
        await removeCloudinaryImages(imageUrls);

        return res.status(200).json({
            success: true,
            message: "Product deleted successfully"
        });
    } catch (error) {
        console.error("Delete Product Error:", error);

        return res.status(500).json({
            success: false,
            message: error.message || "Failed to delete product"
        });
    }
};

export const updateProductStatus = async (req, res) => {
    try {
        const { id } = req.params;

        if (!isValidObjectId(id)) {
            return res.status(400).json({
                success: false,
                message: "A valid Product ID is required"
            });
        }

        const product = await ProductModel.findById(id);

        if (!product) {
            return res.status(404).json({
                success: false,
                message: "Product not found"
            });
        }

        product.status = !product.status;
        await product.save();

        return res.status(200).json({
            success: true,
            message: "Product status updated successfully",
            status: product.status
        });
    } catch (error) {
        return res.status(500).json({
            success: false,
            message: error.message
        });
    }
};

export const getProductByAdmin = async (req, res) => {
    try {
        const { page, limit, skip } = parsePagination(req.query);

        const [product, total] = await Promise.all([
            ProductModel.find()
                .populate("categoryId")
                .populate("recipe")
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limit),

            ProductModel.countDocuments()
        ]);

        return res.status(200).json({
            success: true,
            count: product.length,
            total,
            page,
            limit,
            totalPages: Math.ceil(total / limit),
            product
        });
    } catch (error) {
        return res.status(500).json({
            success: false,
            message: error.message
        });
    }
};

export const getProduct = async (req, res) => {
    try {
        const { page, limit, skip } = parsePagination(req.query);
        const filter = { status: true };

        const [product, total] = await Promise.all([
            ProductModel.find(filter)
                .populate("categoryId")
                .populate("recipe")
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limit),

            ProductModel.countDocuments(filter)
        ]);

        return res.status(200).json({
            success: true,
            count: product.length,
            total,
            page,
            limit,
            totalPages: Math.ceil(total / limit),
            product
        });
    } catch (error) {
        return res.status(500).json({
            success: false,
            message: error.message
        });
    }
};

export const getProuctBySlug = async (req, res) => {
    try {
        const { slug } = req.params;

        if (!slug?.trim()) {
            return res.status(400).json({
                success: false,
                message: "Slug is required"
            });
        }

        const product = await ProductModel.findOne({
            slug: slug.trim(),
            status: true
        })
            .populate("categoryId")
            .populate("recipe");

        if (!product) {
            return res.status(404).json({
                success: false,
                message: "Product not found"
            });
        }

        return res.status(200).json({
            success: true,
            product
        });
    } catch (error) {
        return res.status(500).json({
            success: false,
            message: error.message
        });
    }
};

export const getProductbyCategoryId = async (req, res) => {
    try {
        const { id } = req.params;

        if (!isValidObjectId(id)) {
            return res.status(400).json({
                success: false,
                message: "A valid category ID is required"
            });
        }

        const { page, limit, skip } = parsePagination(req.query);

        const filter = {
            categoryId: id,
            status: true
        };

        const [product, total] = await Promise.all([
            ProductModel.find(filter)
                .populate("categoryId")
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limit),

            ProductModel.countDocuments(filter)
        ]);

        return res.status(200).json({
            success: true,
            count: product.length,
            total,
            page,
            limit,
            totalPages: Math.ceil(total / limit),
            product
        });
    } catch (error) {
        return res.status(500).json({
            success: false,
            message: error.message
        });
    }
};

export const searchProduct = async (req, res) => {
    try {
        const { page, limit, skip } = parsePagination(req.query);
        const { q } = req.query;

        if (typeof q !== "string" || !q.trim()) {
            return res.status(400).json({
                success: false,
                message: "Search query is required"
            });
        }

        const searchRegex = new RegExp(escapeRegex(q.trim()), "i");

        const categories = await ProductCategoryModel.find({
            $or: [
                { name: searchRegex },
                { slug: searchRegex }
            ]
        }).select("_id");

        const categoryIds = categories.map((category) => category._id);

        const filter = {
            status: true,
            $or: [
                { name: searchRegex },
                { slug: searchRegex },
                { categoryId: { $in: categoryIds } }
            ]
        };

        const [products, total] = await Promise.all([
            ProductModel.find(filter)
                .populate("categoryId")
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limit),

            ProductModel.countDocuments(filter)
        ]);

        return res.status(200).json({
            success: true,
            products,
            pagination: {
                page,
                limit,
                total,
                totalPages: Math.ceil(total / limit)
            }
        });
    } catch (error) {
        return res.status(500).json({
            success: false,
            message: error.message
        });
    }
};

export const getProductByCategorySlug = async (req, res) => {
    try {
        const { slug } = req.params;

        if (!slug?.trim()) {
            return res.status(400).json({
                success: false,
                message: "Slug is required"
            });
        }

        const category = await ProductCategoryModel.findOne({
            slug: slug.trim()
        });

        if (!category) {
            return res.status(404).json({
                success: false,
                message: "Category not found"
            });
        }

        const { page, limit, skip } = parsePagination(req.query);

        const filter = {
            categoryId: category._id,
            status: true
        };

        const [products, total] = await Promise.all([
            ProductModel.find(filter)
                .populate("categoryId")
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limit),

            ProductModel.countDocuments(filter)
        ]);

        return res.status(200).json({
            success: true,
            products,
            pagination: {
                page,
                limit,
                total,
                totalPages: Math.ceil(total / limit)
            }
        });
    } catch (error) {
        return res.status(500).json({
            success: false,
            message: error.message
        });
    }
};
